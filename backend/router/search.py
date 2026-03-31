from fastapi import APIRouter, Query, HTTPException, Response
from schemas.schemas import *
from services.ai_scraper import *
from core.database import *
from services.geo_service import *
from repositories.destination_repo import get_existing_destinations
from fastapi.encoders import jsonable_encoder # 幫忙把複雜物件轉成標準 JSON
import json
from core.redis import get_redis
from worker.tasks import celery_app, scrape_and_save_destinations_task
import base64
from urllib.parse import urlparse
from curl_cffi.requests import AsyncSession # 改用這個來突破 Cloudflare


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
    if len(existing_spots_data) >= 5 or (is_cooldown and len(existing_spots_data) > 0):
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

@router.get("/api/popular-searches")
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
            redis_client.setex(cache_key, 86400, json.dumps(popular_regions))
        except Exception as e:
            print(f"⚠️ Redis 寫入失敗: {e}")

        return {"status": "success", "data": popular_regions}

    except Exception as e:
        print(f"❌ 取得熱門搜尋失敗: {e}")
        # 如果真的出錯，至少給幾個預設值墊檔
        fallback_data = ["東京", "上海", "巴黎", "沖繩", "紐約", "首爾"]
        return {"status": "success", "data": fallback_data}
    

# 專屬圖片代理路由：破解防盜鏈並提供獨立 Redis 快取 景點圖片改由後端處理
@router.get("/api/image-proxy")
async def image_proxy(url: str = Query(..., description="要代抓的第三方圖片網址")):
    
    redis_client = get_redis()

    cache_key = f"image_cache:{url}"

    # 找快取資料
    try:
        cached_data = redis_client.get(cache_key)
        if cached_data:
            # 命中快取，直接將 Bytes 轉成圖片格式回傳，通常假定為 jpeg，瀏覽器大部分都能聰明地自行解析
            # 將 Base64 字串解碼還原成二進位圖片
            image_bytes = base64.b64decode(cached_data)
            return Response(content=image_bytes, media_type="image/jpeg")
    except Exception as e:
        print(f"⚠️ Redis 讀取失敗: {e}")
    
    # 快取未命中，去網址抓圖片
    # 1. 建立專屬網域繞過403錯誤
    try:
        # 使用 urlparse 解析網址，例如會把 https://example.com/a.jpg 拆開
        parsed_url = urlparse(url)
        # 組合出對方的根目錄，例如 https://example.com/
        domain_referer = f"{parsed_url.scheme}://{parsed_url.netloc}/"
    except Exception:
        # 萬一解析失敗，就退回原本的 google 當備案，告訴對方伺服器：「我是從 Google 搜尋點進來的」
        domain_referer = "https://www.google.com/"

    # 2. 偽造 Header 破解防盜鏈 (Anti-Hotlinking)
    headers = {
        # 偽裝成正常的 Google Chrome 瀏覽器
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        
        "Referer": domain_referer 
    }
    
    # 3. 使用 curl_cffi 並開啟 impersonate="chrome" (完美偽裝模式)
    async with AsyncSession(impersonate="chrome120") as client:
        try:
            resp = await client.get(url, headers=headers, timeout=10.0)
            resp.raise_for_status() # 只接受 200 如果對方回傳 403/404/500，直接拋出例外
            
            image_bytes = resp.content
            # 嘗試抓取對方原始的 Content-Type，抓不到就預設 jpeg
            content_type = resp.headers.get("Content-Type", "image/jpeg")

            # ==========================================
            # 抓取成功：寫入 Redis (設定 24 小時過期)
            # ==========================================
            try:
                # 將圖片 Bytes 編碼成 Base64 字串，這樣 Redis 就不會報 utf-8 錯誤了
                encoded_string = base64.b64encode(image_bytes).decode('utf-8')
                redis_client.setex(cache_key, 86400, encoded_string)
            except Exception as e:
                print(f"⚠️ Redis 圖片寫入失敗: {e}")

            return Response(content=image_bytes, media_type=content_type)
            # content=image_bytes：這裡裝的確實是原始的二進位資料（Binary Data）。沒錯，如果單純把它印出來看，就是一堆電腦才看得懂的亂碼（例如 b'\xff\xd8\xff\xe0\x00\x10JFIF...'）。
            # media_type=content_type：這是魔法發生的關鍵！ 這是在告訴接收方（前端瀏覽器）：「嘿！雖然我傳給你一堆二進位亂碼，但請你把它當作 image/jpeg（或是 png、gif）來解析喔！」

        except Exception as e:
            print(f"❌ 圖片代理抓取失敗 ({url}): {e}")
            # 如果真的抓不到（對方圖床掛了或刪除了），回傳 404
            # 這樣前端的 <img onError={...}> 就能捕捉到錯誤，並換成預設風景圖
            raise HTTPException(status_code=404, detail="圖片下載失敗")