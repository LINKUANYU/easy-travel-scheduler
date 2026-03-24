from fastapi import APIRouter
from schemas.schemas import *
from services.ai_scraper import *
from core.database import *
from services.geo_service import *
from repositories.destination_repo import get_existing_destinations
from fastapi.encoders import jsonable_encoder # 🌟 幫忙把複雜物件轉成標準 JSON
import json
from core.redis import get_redis
from worker.tasks import celery_app, scrape_and_save_destinations_task


router = APIRouter()

@router.post("/api/search")
async def search_destinations_api(
    payload: SearchRequest,
    cur = Depends(get_cur)
):
    location = payload.location

    redis_client = get_redis()
    
    # 定義這筆搜尋的專屬快取鑰匙 (Cache Key) Key: "search:location:台北"
    cache_key = f"search:location:{location}"

    # ==========================================
    # 一、 快取攔截 (Cache-Aside: Read)
    # ==========================================
    try:
        cached_data = redis_client.get(cache_key)
        if cached_data:
            print(f"🚀 命中 Redis 快取！直接回傳「{location}」的資料")
            # 將字串反序列化為 Python 字典/陣列後回傳
            data = json.loads(cached_data)
            return {"status": "completed", "data": data}
    except Exception as e:
        # 容錯機制：就算 Redis 掛了，我們也不要中斷程式，繼續往資料庫找
        print(f"⚠️ Redis 讀取失敗: {e}")
    

    # ==========================================
    # 二、 查閱資料庫有資料 - 快取未命中
    # ==========================================

    # 1.【搜尋】階段：多欄位模糊比對 (向上支援與向下支援的關鍵)
    # 我們同時找：輸入區域、城市名稱、以及標籤內是否包含關鍵字
    
    existing_spots_data = get_existing_destinations(location, cur)

    # 檢查快取是否1天前搜尋過
    is_cooldown = redis_client.get(f"cooldown:location:{location}")
    
    # 2. 【門檻檢查】：如果有 15 個以上景點或是剛剛才搜尋完，直接回傳，省下 Gemini 費用
    if len(existing_spots_data) >= 15 or (is_cooldown and len(existing_spots_data) > 0):
        # 組合資料回給前端
        print(f"資料庫足夠的「{location}」資料")

        try:
            # 寫入快取
            # 使用 jsonable_encoder 確保格式安全，有時候我們從資料庫拿出來的資料，裡面會混雜一些奇怪的格式（例如時間格式 datetime、或是特殊的資料庫物件），這個工具會像濾網一樣，把它們全部「淨化」成最標準、乾淨的 Python 字典和陣列。
            # json.dumps 把淨化好的乾淨資料，整個打包變成一長串的 JSON 格式字串。這樣 Redis 就能毫無阻礙地把它吞進去存起來了！
            # setex (Set with Expiration) 的第二個參數是 TTL 秒數，86400 秒 = 24 小時
            redis_client.setex(cache_key, 86400, json.dumps(jsonable_encoder(existing_spots_data)))
        except Exception:
            pass
            
        return {"status": "completed", "data": existing_spots_data}
    
    # 如果剛爬完，但真的一個景點都沒找到 (極端情況)
    elif is_cooldown and len(existing_spots_data) == 0:
        return {"status": "failed", "error": f"找不到關於「{location}」的景點"}
    
    # ==========================================
    # 三、 交給Celery (DB 查詢與爬蟲) - 快取未命中
    # ==========================================
    else:
        # 🌟 1天前沒搜尋過 &【資料不足】：發送 Celery 任務！
        print(f"⚠️ 資料不足，派發 Celery 任務進行爬蟲...")
        # 使用 .delay() 將任務丟給背景的 Celery Worker
        task = scrape_and_save_destinations_task.delay(location)
        
        # 瞬間回傳號碼牌給前端！
        return {
            "status": "processing", 
            "task_id": task.id,  # 自動產生
            "message": "任務已交給背景處理，請稍候..."
        }



# 查詢任務進度 API (叫號碼牌)
@router.get("/api/search/status/{task_id}")
def get_task_status(task_id: str):
    # 透過 celery_app 去 Redis 查詢這個任務的狀態
    task_result = celery_app.AsyncResult(task_id)
    
    # started：celery 正在處理，pending：還沒處理，還在上一單
    if task_result.state == 'PENDING' or task_result.state == 'STARTED':  
        return {"status": "processing"}
    elif task_result.state == 'SUCCESS':
        return {"status": "completed", "result": task_result.result}
    elif task_result.state == 'FAILURE':
        return {"status": "failed", "error": str(task_result.info)}
    # 一些冷門的狀態（例如 RETRY 正在重試、REVOKED 任務被強制取消）。
    else:
        return {"status": task_result.state.lower()}