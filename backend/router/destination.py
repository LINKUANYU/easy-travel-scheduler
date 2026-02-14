from fastapi import APIRouter, BackgroundTasks
from model.schema import *
from services.fetcher_service import *
from services.db_service import *
from services.geo_service import *

router = APIRouter()

@router.post("/api/search", response_model=SearchResponse)
async def search_destinations_api(
    payload: SearchRequest,
    background_tasks: BackgroundTasks,
    cur = Depends(get_cur)
):
    location = payload.location
    
    # 1.【搜尋】階段：多欄位模糊比對 (向上支援與向下支援的關鍵)
    # 我們同時找：輸入區域、城市名稱、以及標籤內是否包含關鍵字
    print("1")
    existing_spots_data = get_existing_destinations(location)
    print("2")
    # 2. 【門檻檢查】：如果有 10 個以上景點，直接回傳，省下 Gemini 費用
    if len(existing_spots_data) >= 10:
        # 組合資料回給前端
        print(f"資料庫足夠的「{location}」資料")
        return {"message": "existing_spots_data", "data": existing_spots_data}

    # 3.【資料不足】叫整套搜尋API補完資料
    print("3")
    new_search_data = run_web_scraping_workflow(location)
    
    print("7")
    # --去重處理：先找google place id
    final_new_data = []
    exsiting_ids = {s['google_place_id'] for s in existing_spots_data if s.get('google_place_id')}
    for spot in new_search_data:
        attraction_name = spot.get('attraction')
        lat, lng, place_id = get_coordinates(attraction_name)
        # 如果新的景點的id不在原本資料中
        if place_id and place_id not in exsiting_ids:
            spot['lat'], spot['lng'], spot['google_place_id'] = lat, lng, place_id  # 就新增key, value
            final_new_data.append(spot) 
            exsiting_ids.add(place_id) # 每一筆寫完後馬上加入既有組別，避免new_search_data自身資料id相同重複寫入

    # 4. 【在背景寫入景點資料】
    print("8")
    # background_tasks.add_task(save_spot_data, final_new_data)
    
    # 5. 【組合新舊資料回給前端】
    total_display_data = existing_spots_data + final_new_data

    # 6. 【回給前端
    return {"message": "total_display_data", "data": total_display_data}
