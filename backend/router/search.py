from fastapi import APIRouter, Query, HTTPException, Response
from schemas.common import *
from schemas.search import *
from services.ai_scraper import *
from core.database import *
from services.geo_service import *
from repositories.destination_repo import get_existing_destinations
from fastapi.encoders import jsonable_encoder # 幫忙把複雜物件轉成標準 JSON
import json
from core.redis import get_redis
from worker.tasks import celery_app, scrape_and_save_destinations_task


router = APIRouter()

@router.post("/api/search", response_model=SearchResponse)
def search_destinations_api(
    payload: SearchRequest,
    cur = Depends(get_cur)
):
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
            redis_client.setex(cache_key, 86400, json.dumps(jsonable_encoder(existing_spots_data)))
        except Exception:
            print(f"⚠️ Redis 讀取失敗: {e}")
            
        return {"status": "completed", "data": existing_spots_data, "is_exhausted": is_exhausted}
    
    # ==========================================
    # 三、【資料不足】 交給Celery (DB 查詢與爬蟲) 
    # ==========================================
    else:
        # # 資料不足，但是地點已在cooldown 中，檢查是否是is_exhausted
        if is_exhausted:
            print(f"⚠️ 資料不足，「{location}」處於冷卻期 (枯竭狀態)，不觸發背景爬蟲。")
            try:
                redis_client.setex(cache_key, 86400, json.dumps(jsonable_encoder(existing_spots_data)))
                return {"status": "completed", "data": existing_spots_data, "is_exhausted": True}
            except Exception:
                print(f"⚠️ Redis 讀取失敗: {e}")
            
        # 資料不足，但是前端已在爬蟲中
        if not allow_scrape:
            print(f"⚠️ 阻擋多重爬蟲：「{location}」只回傳現有資料。")
            return {"status": "blocked", "data": existing_spots_data, "is_exhausted": is_exhausted}
        
        # 發送 Celery 任務！
        try:
            print(f"資料不足，派發 Celery 任務進行爬蟲...")
            # 先測試連線
            active_workers = celery_app.control.ping(timeout=0.5)
            if not active_workers:
                print("❌ 錯誤： Celery Worker 連線失敗")
                raise HTTPException(status_code=503, detail="錯誤： Celery Worker 連線失敗")
        except Exception as e:
            print(f"❌ Celery Ping 失敗: {e}")
            raise HTTPException(status_code=503, detail="後端伺服器錯誤，請稍後再試")
        
        # 使用 .delay() 將任務丟給背景的 Celery Worker
        task = scrape_and_save_destinations_task.delay(location)

        return {
            "status": "processing", 
            "task_id": task.id,  # 自動產生
            "is_exhausted": is_exhausted
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

# 查詢任務進度 API (叫號碼牌)
@router.get("/api/search/status/{task_id}", response_model=TaskStatusResponse)
def get_task_status(task_id: str):
    # 透過 celery_app 去 Redis 查詢這個任務的狀態
    task_result = celery_app.AsyncResult(task_id)
    
    # started：celery 正在處理，pending：還沒處理，還在上一單
    if task_result.state == 'PENDING' or task_result.state == 'STARTED':  
        return {"status": "processing"}
    elif task_result.state == 'SUCCESS':
        return {"status": "completed"}
    elif task_result.state == 'FAILURE':
        return {"status": "failed", "error": str(task_result.info)}
    # 一些冷門的狀態（例如 RETRY 正在重試、REVOKED 任務被強制取消）。
    else:
        return {"status": task_result.state.lower()}

@router.get("/api/popular-searches", response_model=PopularSearchesResponse)
def get_popular_searches(cur = Depends(get_cur)):
    redis_client = get_redis()

    # 定義這筆搜尋的專屬快取鑰匙 (Cache Key) Key
    cache_key = "homepage:popular_search"

    try:
        cached_data = redis_client.get(cache_key)
        if cached_data:
            return {"status": "success", "data": json.loads(cached_data)}
    except Exception as e:
        print(f"⚠️ Redis 讀取失敗: {e}")

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

        try:
            redis_client.setex(cache_key, 3600, json.dumps(popular_regions))
        except Exception as e:
            print(f"⚠️ Redis 寫入失敗: {e}")

        return {"status": "success", "data": popular_regions}

    except Exception as e:
        print(f"❌ 取得熱門搜尋失敗: {e}")
        # 如果真的出錯，至少給幾個預設值墊檔
        fallback_data = ["東京", "上海", "巴黎", "沖繩", "紐約", "首爾"]
        return {"status": "success", "data": fallback_data}
    
