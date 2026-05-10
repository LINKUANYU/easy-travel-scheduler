# tasks.py
import os
import json
from celery import Celery
from core.database import POOL, set_utc
from services.ai_scraper import run_web_scraping_workflow
from repositories.destination_repo import save_spot_data
from core.redis import get_redis
from celery.exceptions import Reject


# 1. 初始化 Celery，指定 Redis 作為 Broker (任務佈告欄) 與 Backend (結果儲存區)
# CELERY_BROKER_URL="sqs://" 只是宣告用 SQS 協定，真正的 queue 網址由 SQS_QUEUE_URL 提供
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL")  # "sqs://"，告訴 Celery 使用 SQS 協定
SQS_QUEUE_URL = os.getenv("SQS_QUEUE_URL")          # 完整的 https:// queue 網址（dev/prod 各不同）
REDIS_RESULT_URL = os.getenv("REDIS_URL")            # 結果儲存區，指向本地或 EC2 的 Redis

# 從 SQS_QUEUE_URL 末段取出 queue 名稱（例如 "easy-travel-celery-queue-dev"）
# 這樣切換 dev/prod queue 時只需改 .env，不用動 code
SQS_QUEUE_NAME = SQS_QUEUE_URL.rsplit("/", 1)[-1] if SQS_QUEUE_URL else "easy-travel-celery-queue"

# 協定層：告訴 Celery 用哪種 Message Broker。
# 當 Celery 看到 sqs://，它就去載入 SQS 的驅動程式（底層是 kombu 函式庫）。這裡不需要完整 URL，因為 SQS 不像 Redis 是一台固定 IP 的伺服器，
celery_app = Celery(
    "travel_tasks",
    broker=CELERY_BROKER_URL,  # 任務佈告欄 / Message Broker
    backend=REDIS_RESULT_URL,  # 結果儲存區 / Result Backend
)

# 路由層：告訴 Celery 這個 queue 的完整網址在哪。
celery_app.conf.update(
    task_default_queue=SQS_QUEUE_NAME,
    broker_transport_options={
        "region": "ap-east-2",  # AWS 部署區域（亞太）
        "visibility_timeout": 600,  # 爬蟲任務時間設定10 min；超時後 SQS 會讓其他 worker 重新處理該任務
        "polling_interval": 20,  # 每 20 秒輪詢一次 SQS，降低 API 請求次數以省錢
        "predefined_queues": {
            # key 必須與 task_default_queue 一致，url 才是真正的 queue 完整網址
            SQS_QUEUE_NAME: {
                "url": SQS_QUEUE_URL
            }
        },
    },
    task_serializer="json",  # 任務資料以 JSON 格式序列化後傳送
    accept_content=["json"],  # 只接受 JSON 格式的任務內容
    result_serializer="json",  # 任務執行結果也以 JSON 格式儲存
    task_track_started=True,  # 任務開始執行時記錄 STARTED 狀態，便於監控進度
    task_acks_late=True,  # 任務成功完成後才 ack（刪除 SQS 訊息），防止 worker crash 導致任務遺失
    task_reject_on_worker_lost=True,  # Worker 意外死亡時，將任務退回佇列而非直接丟棄
)


# 2. 定義要在背景執行的任務 (把原本 search.py 裡最耗時的邏輯搬過來)
@celery_app.task(bind=True)
def scrape_and_save_destinations_task(self, location: str):
    """
    這是一個由 Celery 負責執行的背景任務。
    注意：因為它在另一個獨立的 Process 執行，所以必須「自己重新建立資料庫連線」！
    """
    print(f"👨‍🍳 Celery 廚師開始處理「{location}」的爬蟲任務...")

    conn = POOL.connection()
    set_utc(conn)
    cur = conn.cursor()

    try:
        # 1. 執行最耗時的爬蟲
        new_search_data = run_web_scraping_workflow(location)
        # 2. 提取這批新資料所有的 google_place_id
        new_place_ids = [spot.get("google_place_id") for spot in new_search_data]

        existing_ids = set()
        if new_place_ids:
            # 3. 用 WHERE IN 語法，精準找出資料庫已經存在的 ID
            # 產生對應數量的 %s (例如 '%s, %s, %s')
            format_strings = ",".join(["%s"] * len(new_place_ids))
            query = f"SELECT google_place_id FROM destinations WHERE google_place_id IN ({format_strings})"

            cur.execute(query, tuple(new_place_ids))
            # 將資料庫已存在的 ID 存進 Set 裡面，查詢速度最快 O(1)
            existing_ids = {row["google_place_id"] for row in cur.fetchall()}

        # 4. 進行去重篩選
        final_new_data = []
        for spot in new_search_data:
            place_id = spot.get("google_place_id")

            # 如果這個 ID 存在，且不在資料庫已有的名單內
            if place_id and place_id not in existing_ids:
                final_new_data.append(spot)
                # 🌟 重要：加進去後要立刻更新 existing_ids 集合！
                # 這是為了防止這一次爬蟲結果「自己內部」就有重複的景點
                existing_ids.add(place_id)

        # 5. 寫入資料庫
        if final_new_data:
            save_spot_data(final_new_data, cur)
            conn.commit()
            print(
                f"✅ Celery 任務完成！爬蟲回來{len(new_search_data)}筆資料，去重後成功寫入 {len(final_new_data)} 筆新景點。"
            )

            # 將快取記錄清空，讓新資料可以被抓到
            redis_client = get_redis()
            redis_client.delete(f"search:location:{location}")
        # 6. 如果抓到的資料數量 < 3 就認定該地點已經沒有更多景點
        if len(final_new_data) < 3:
            print(
                f"❄️ 新增景點小於 3 ({len(final_new_data)})，觸發「{location}」冷卻機制 1 天"
            )
            redis_client.setex(f"exhausted:location:{location}", 86400, "1")

        # 任務完成後，主動 PUBLISH 到 Redis 頻道，通知 SSE 端點立刻推送結果給前端。
        # 頻道名稱格式：task_done:{task_id}，SSE 端點訂閱同一個頻道名稱來等待通知。
        redis_client = get_redis()
        redis_client.publish(
            f"task_done:{self.request.id}",
            json.dumps({"status": "completed"}),  # payload 為 JSON 字串，前端可直接解析
        )
        print(f"[Pub/Sub] task_id={self.request.id} 已 PUBLISH completed")

        # 任務完成，回傳結果 (這個結果會被存回 Redis 的 Backend 中)
        return {
            "location": location,
            "status": "success",
            "added_count": len(final_new_data),
        }

    except ValueError as e:
        # 永久性失敗（地點無效、AI 額度耗盡）raise 標記 FAILURE，不進 DLQ
        print(f"❌ 永久性失敗，不重試: {e}")
        conn.rollback()

        # 永久失敗也要 PUBLISH，讓 SSE 端點知道任務已確定結束，不需要繼續等待。
        # 注意：只有「確定不會再重試」的情況才 PUBLISH，避免前端提前放棄還在重試的任務。
        try:
            redis_client = get_redis()
            redis_client.publish(
                f"task_done:{self.request.id}",
                json.dumps({"status": "failed"}),
            )
            print(f"[Pub/Sub] task_id={self.request.id} 已 PUBLISH failed")
        except Exception as pub_err:
            # PUBLISH 失敗不應影響主流程，只記錄 log
            print(f"⚠️ PUBLISH failed 訊息失敗: {pub_err}")

        raise
    except Exception as e:
        print(f"❌ 暫時性失敗，交給 SQS 重試: {e}")
        conn.rollback()
        # 暫時性錯誤（DB 斷線、網路問題）→ 不 ack，讓訊息退回 SQS，超過次數後進 DLQ
        # 這會告訴 Kombu (Celery 的底層) 發送 visibility timeout = 0 的指令給 SQS
        # 讓 SQS 的 ReceiveCount +1，並準備下一次重試。
        raise Reject(str(e), requeue=True)
    finally:
        cur.close()
        conn.close()
