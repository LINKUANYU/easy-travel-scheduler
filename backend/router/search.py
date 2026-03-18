from fastapi import APIRouter
from model.schema import *
from services.fetcher_service import *
from services.db_service import *
from services.geo_service import *
from fastapi.encoders import jsonable_encoder # 🌟 幫忙把複雜物件轉成標準 JSON
import json
from services.redis_service import get_redis

router = APIRouter()

@router.post("/api/search", response_model=list[Attraction])
async def search_destinations_api(
    payload: SearchRequest,
    cur = Depends(get_cur)
):
    location = payload.location

    redis_client = get_redis()
    
    # 定義這筆搜尋的專屬快取鑰匙 (Cache Key)
    cache_key = f"search:location:{location}"

    # ==========================================
    # 🌟 一、 快取攔截 (Cache-Aside: Read)
    # ==========================================
    try:
        cached_data = redis_client.get(cache_key)
        if cached_data:
            print(f"🚀 命中 Redis 快取！直接回傳「{location}」的資料")
            # 將字串反序列化為 Python 字典/陣列後回傳
            return json.loads(cached_data)
    except Exception as e:
        # 容錯機制：就算 Redis 掛了，我們也不要中斷程式，繼續往資料庫找
        print(f"⚠️ Redis 讀取失敗: {e}")
    

    # ==========================================
    # 二、 原始邏輯 (DB 查詢與爬蟲) - 快取未命中時才會執行到這裡
    # ==========================================

    # 1.【搜尋】階段：多欄位模糊比對 (向上支援與向下支援的關鍵)
    # 我們同時找：輸入區域、城市名稱、以及標籤內是否包含關鍵字
    
    existing_spots_data = get_existing_destinations(location, cur)
    
    # 2. 【門檻檢查】：如果有 10 個以上景點，直接回傳，省下 Gemini 費用
    if len(existing_spots_data) >= 10:
        # 組合資料回給前端
        print(f"資料庫足夠的「{location}」資料")
        total_display_data = existing_spots_data
        
    else:
        # 3.【資料不足】叫整套搜尋API補完資料
        new_search_data = run_web_scraping_workflow(location)
        
        
        # --去重處理：先找google place id
        final_new_data = []
        exsiting_ids = {s['google_place_id'] for s in existing_spots_data if s.get('google_place_id')}
        for spot in new_search_data:
            attraction_name = spot.get('attraction')
            lat, lng, place_id, address = get_coordinates(attraction_name)
            # 如果新的景點的id不在原本資料中
            if place_id and place_id not in exsiting_ids:
                spot['lat'], spot['lng'], spot['google_place_id'], spot["address"] = lat, lng, place_id, address  # 就新增key, value
                final_new_data.append(spot) 
                exsiting_ids.add(place_id) # 每一筆寫完後馬上加入既有組別，避免new_search_data自身資料id相同重複寫入

        # 4. 【寫入景點資料】
        
        saved_new_data = save_spot_data(final_new_data, cur)
        
        # 5. 【組合新舊資料回給前端】
        total_display_data = existing_spots_data + saved_new_data


    # ==========================================
    # 三、 寫入快取 (Cache-Aside: Write)
    # ==========================================
    try:
        # 使用 jsonable_encoder 確保格式安全，轉成 JSON 字串存入 Redis
        # setex (Set with Expiration) 的第二個參數是 TTL 秒數，86400 秒 = 24 小時
        redis_client.setex(
            cache_key, 
            86400, 
            json.dumps(jsonable_encoder(total_display_data))
        )
        print(f"💾 已將「{location}」的資料寫入 Redis 快取 (保留 24 小時)")
    except Exception as e:
        print(f"⚠️ Redis 寫入失敗: {e}")

    return total_display_data
