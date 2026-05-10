from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from schemas.search import (
    SearchRequest,
    SearchResponse,
    SearchMore,
    SearchMoreResponse,
    TaskStatusResponse,
    PopularSearchesResponse,
)
from core.database import Depends, get_cur
from repositories.destination_repo import get_existing_destinations
from fastapi.encoders import jsonable_encoder  # 幫忙把複雜物件轉成標準 JSON
import json
import time
import asyncio
from core.redis import get_redis, get_async_redis, redis_cache
from worker.tasks import celery_app, scrape_and_save_destinations_task


router = APIRouter()


@router.post("/api/search", response_model=SearchResponse)
def search_destinations_api(payload: SearchRequest, cur=Depends(get_cur)):
    location = payload.location
    allow_scrape = payload.allow_scrape

    redis_client = get_redis()

    # 定義這筆搜尋的專屬快取鑰匙 (Cache Key) Key: "search:location:台北"
    cache_key = f"search:location:{location}"
    # 檢查該地點是否已經耗盡景點
    exhausted_key = f"exhausted:location:{location}"
    is_exhausted = bool(redis_client.get(exhausted_key))

    # ==========================================
    # 一、 快取攔截 (Cache-Aside: Read)
    # ==========================================
    try:
        cached_data = redis_client.get(cache_key)
        if cached_data:
            print(f"🚀 命中 Redis 快取！直接回傳「{location}」的資料")
            # 將字串反序列化為 Python 字典/陣列後回傳
            data = json.loads(cached_data)
            return {"status": "completed", "data": data, "is_exhausted": is_exhausted}
    except Exception as e:
        # 容錯機制：就算 Redis 掛了，我們也不要中斷程式，繼續往資料庫找
        print(f"⚠️ Redis 讀取失敗: {e}")

    # ==========================================
    # 二、 查閱資料庫有資料 - 快取未命中
    # ==========================================

    # 1.【搜尋】階段：多欄位模糊比對 (向上支援與向下支援的關鍵)
    # 我們同時找：輸入區域、城市名稱、以及標籤內是否包含關鍵字

    existing_spots_data = get_existing_destinations(location, cur)

    # 2. 【門檻檢查】：如果有 5 個以上就先回傳，如果小於 5 個就觸發爬蟲，自動幫使用者搜尋
    if len(existing_spots_data) >= 5:
        # 組合資料回給前端
        print(f"資料庫足夠的「{location}」資料")

        try:
            # 寫入快取
            # 使用 jsonable_encoder 確保格式安全，有時候我們從資料庫拿出來的資料，裡面會混雜一些奇怪的格式（例如時間格式 datetime、或是特殊的資料庫物件），這個工具會像濾網一樣，把它們全部「淨化」成最標準、乾淨的 Python 字典和陣列。
            redis_client.setex(
                cache_key, 86400, json.dumps(jsonable_encoder(existing_spots_data))
            )
        except Exception as e:
            print(f"⚠️ Redis 讀取失敗: {e}")

        return {
            "status": "completed",
            "data": existing_spots_data,
            "is_exhausted": is_exhausted,
        }

    # ==========================================
    # 三、【資料不足】 交給Celery (DB 查詢與爬蟲)
    # ==========================================
    else:
        # # 資料不足，但是地點已在cooldown 中，檢查是否是is_exhausted
        if is_exhausted:
            print(f"⚠️ 資料不足，「{location}」處於冷卻期 (枯竭狀態)，不觸發背景爬蟲。")
            try:
                redis_client.setex(
                    cache_key, 86400, json.dumps(jsonable_encoder(existing_spots_data))
                )
                return {
                    "status": "completed",
                    "data": existing_spots_data,
                    "is_exhausted": True,
                }
            except Exception as e:
                print(f"⚠️ Redis 讀取失敗: {e}")

        # 資料不足，但是前端已在爬蟲中
        if not allow_scrape:
            print(f"⚠️ 阻擋多重爬蟲：「{location}」只回傳現有資料。")
            return {
                "status": "blocked",
                "data": existing_spots_data,
                "is_exhausted": is_exhausted,
            }

        # 發送 Celery 任務！
        print("資料不足，將任務派發至 AWS SQS 排隊...")

        try:
            # 直接使用 .delay() 將任務丟給 SQS
            task = scrape_and_save_destinations_task.delay(location)
        except Exception as e:
            # 如果走到這裡，通常是 AWS IAM 權限錯了，或是 SQS 網址填錯
            print(f"❌ 任務發送至 SQS 失敗: {e}")
            raise HTTPException(status_code=503, detail="任務發送失敗，請稍候再試")

        return {
            "status": "processing",
            "task_id": task.id,  # 自動產生
            "is_exhausted": is_exhausted,
        }


@router.post("/api/search-more", response_model=SearchMoreResponse)
def search_more_destinations_api(payload: SearchMore):
    location = payload.location
    redis_client = get_redis()

    exhausted_key = f"exhausted:location:{location}"
    if redis_client.get(exhausted_key):
        return {"status": "failed", "error": "目前此地點已無更多推薦景點。"}

    # 觸發爬蟲任務
    print(f"🔄 觸發再次搜尋：「{location}」")
    task = scrape_and_save_destinations_task.delay(location)

    return {"status": "processing", "task_id": task.id}


# ==========================================
# 【保留】原本的 Polling endpoint（暫時保留，不予刪除）
# ==========================================
@router.get("/api/search/status/{task_id}", response_model=TaskStatusResponse)
def get_task_status(task_id: str):
    # 透過 celery_app 去 Redis 查詢這個任務的狀態
    task_result = celery_app.AsyncResult(task_id)

    # started：celery 正在處理，pending：還沒處理，還在上一單
    if task_result.state == "PENDING" or task_result.state == "STARTED":
        return {"status": "processing"}
    elif task_result.state == "SUCCESS":
        return {"status": "completed"}
    elif task_result.state == "FAILURE":
        return {"status": "failed", "error": str(task_result.info)}
    # 一些冷門的狀態（例如 RETRY 正在重試、REVOKED 任務被強制取消）。
    else:
        return {"status": task_result.state.lower()}


# ==========================================
# 【新增】SSE endpoint，前端建立連線後，後端主動推送任務進度
# ==========================================
@router.get("/api/search/stream/{task_id}")
async def stream_task_status(task_id: str, request: Request):
    """
    SSE (Server-Sent Events) endpoint — Redis Pub/Sub 事件驅動版本。
    - 訂閱 Redis 頻道 task_done:{task_id}，掛起等待 Celery Worker 主動 PUBLISH，
            Worker 完成後訊號立刻到達，連線掛起期間不消耗 CPU。
    """

    async def generator():
        # ── 初始化：建立非同步 Redis 連線並訂閱頻道 ──
        redis_conn = await get_async_redis()
        pubsub = redis_conn.pubsub()
        channel_name = f"task_done:{task_id}"
        await pubsub.subscribe(channel_name)
        print(f"[SSE] task_id={task_id} 已訂閱頻道 {channel_name}")

        # 共用輸出管道：兩個 task 都透過這個 queue 把訊號傳給主 generator
        # Queue item 格式：
        #   {"type": "heartbeat"}                                             → 心跳
        #   {"type": "done", "status": "completed"|"failed"|"timeout"|"disconnected"}
        queue: asyncio.Queue = asyncio.Queue()

        # ── Task A：listen_task ──
        # 使用 pubsub.listen() 讓 asyncio 把 socket 交給 epoll 監控，
        # 真正做到「訊息到才喚醒」，連線掛起期間不做任何事，不消耗 CPU。
        async def listen_task():
            async for message in pubsub.listen():
                # 過濾系統訊息（訂閱確認等 type != "message" 的訊息），只處理 PUBLISH 的內容
                if message["type"] != "message":
                    continue

                payload = message.get("data", "")
                print(f"[SSE][listen_task] task_id={task_id} 收到訊息：{payload}")

                try:
                    data = json.loads(payload)
                    status = data.get("status", "")
                except (json.JSONDecodeError, AttributeError):
                    print(f"⚠️ [SSE][listen_task] task_id={task_id} 非預期格式，跳過")
                    continue

                if status in ("completed", "failed"):
                    # 收到明確結束訊號，放入 queue 通知主 generator，然後結束
                    await queue.put({"type": "done", "status": status})
                    return

        # ── Task B：heartbeat_task ──
        # 每 30 秒執行一次：先 sleep 再檢查，確保不會一啟動就立刻觸發。
        # 負責：心跳推送（避免中間層切斷靜默連線）、斷線偵測、逾時保護。
        async def heartbeat_task():
            deadline = time.monotonic() + 600  # 10 分鐘逾時上限

            while True:
                # 先等 30 秒，讓出 Event Loop 給其他 coroutine
                await asyncio.sleep(30)

                # 檢查 10 分鐘總逾時
                if time.monotonic() > deadline:
                    print(f"[SSE][heartbeat_task] task_id={task_id} 超過 10 分鐘，逾時")
                    await queue.put({"type": "done", "status": "timeout"})
                    return

                # 檢查前端是否已關閉瀏覽器或離開頁面
                if await request.is_disconnected():
                    print(f"[SSE][heartbeat_task] task_id={task_id} 使用者斷線")
                    await queue.put({"type": "done", "status": "disconnected"})
                    return

                # 使用者仍在線且未逾時，推送心跳
                # 讓前端知道任務還在跑；同時讓 Nginx / ALB 知道連線還活著，不要切斷
                await queue.put({"type": "heartbeat"})

        # 同時啟動兩個背景 task，讓它們並行執行
        task_a = asyncio.create_task(listen_task())
        task_b = asyncio.create_task(heartbeat_task())

        try:
            # 主 generator 從 queue 取出訊號，決定 yield 什麼給前端
            while True:
                item = await queue.get()

                if item["type"] == "heartbeat":
                    # 推送心跳，讓前端知道任務仍在進行中
                    yield f"data: {json.dumps({'status': 'processing'})}\n\n"

                elif item["type"] == "done":
                    status = item["status"]

                    if status == "disconnected":
                        # 使用者已斷線，不需要推送任何東西，靜默結束
                        print(f"[SSE] task_id={task_id} 靜默結束（使用者斷線）")
                        break

                    # 其他結束狀態（completed / failed / timeout）推送給前端後結束
                    print(f"[SSE] task_id={task_id} 推送最終狀態：{status}")
                    yield f"data: {json.dumps({'status': status})}\n\n"
                    break

        finally:
            # ── 清理：無論正常結束或例外，依序釋放所有資源 ──

            # 步驟一：取消兩個背景 task，避免它們繼續跑造成資源洩漏
            # cancel() 發出取消請求，await 等待它真正停下來
            # CancelledError 是 cancel 後的預期行為，必須捕捉否則會往上傳播
            for t in (task_a, task_b):
                t.cancel()
                try:
                    await t
                except asyncio.CancelledError:
                    pass

            # 步驟二：取消 Redis 頻道訂閱，釋放 Redis 伺服器端的資源
            await pubsub.unsubscribe(channel_name)

            # 步驟三：關閉這條獨立的非同步 Redis 連線
            await redis_conn.close()
            print(f"[SSE] task_id={task_id} 已取消訂閱並關閉 Redis 連線")

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            # 告訴瀏覽器不要快取這個回應
            "Cache-Control": "no-cache",
            # 告訴 Nginx 不要對這條連線套用 proxy buffering
            # 效果等同於在 nginx.conf 設定 proxy_buffering off，這裡雙重確保
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/api/popular-searches", response_model=PopularSearchesResponse)
@redis_cache(cache_key="homepage:popular_search", expire_seconds=3600)
def get_popular_searches(cur=Depends(get_cur)):
    # --- 只要進到這裡，就代表快取沒命中，我們專心寫 DB 邏輯 ---
    query = """
        SELECT input_region, COUNT(*)
        FROM destinations
        WHERE input_region IS NOT NULL AND input_region != ''
        GROUP BY input_region
        ORDER BY COUNT(*) DESC
        LIMIT 6
    """

    try:
        cur.execute(query)
        rows = cur.fetchall()

        popular_regions = [r["input_region"] for r in rows]

        return {"status": "success", "data": popular_regions}

    except Exception as e:
        print(f"❌ 取得熱門搜尋失敗: {e}")
        # 如果真的出錯，至少給幾個預設值墊檔
        fallback_data = ["東京", "上海", "巴黎", "沖繩", "紐約", "首爾"]
        return {"status": "success", "data": fallback_data}
