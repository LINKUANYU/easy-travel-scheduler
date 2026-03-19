# tasks.py
import os
from celery import Celery
from core.database import POOL, set_utc
from services.ai_scraper import run_web_scraping_workflow
from services.geo_service import get_coordinates
from repositories.destination_repo import save_spot_data



# 1. 初始化 Celery，指定 Redis 作為 Broker (任務佈告欄) 與 Backend (結果儲存區)
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = os.getenv("REDIS_PORT", "6379")
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")

# 組合 Redis 連線網址 (如果有密碼的話格式會是 redis://:password@host:port/0)
redis_auth = f":{REDIS_PASSWORD}@" if REDIS_PASSWORD else ""
REDIS_URL = f"redis://{redis_auth}{REDIS_HOST}:{REDIS_PORT}/0"  # Celery 套件的設計規定，它吃的是一整串的 URL 網址格式

celery_app = Celery(
    "travel_tasks",
    broker=REDIS_URL,  # 任務佈告欄 / Message Broker
    backend=REDIS_URL  # 結果儲存區 / Result Backend
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
        
        # 2. 為了去重，先抓出資料庫目前已經有的 google_place_id
        cur.execute("SELECT google_place_id FROM destinations WHERE city_name = %s", (location,))
        existing_ids = {row['google_place_id'] for row in cur.fetchall() if row['google_place_id']}
        
        final_new_data = []
        for spot in new_search_data:
            attraction_name = spot.get('attraction')
            lat, lng, place_id, address = get_coordinates(attraction_name)
            
            if place_id and place_id not in existing_ids:
                spot['lat'] = lat
                spot['lng'] = lng
                spot['google_place_id'] = place_id
                spot["address"] = address
                final_new_data.append(spot) 
                existing_ids.add(place_id)
        
        # 3. 寫入資料庫
        if final_new_data:
            save_spot_data(final_new_data, cur)
            conn.commit()
            print(f"✅ Celery 任務完成！成功寫入 {len(final_new_data)} 筆新景點。")
            
        # 任務完成，回傳結果 (這個結果會被存回 Redis 的 Backend 中)
        return {"location": location, "status": "success", "added_count": len(final_new_data)}
        
    except Exception as e:
        print(f"❌ Celery 任務失敗: {e}")
        conn.rollback()
        raise e
    finally:
        cur.close()
        conn.close()

