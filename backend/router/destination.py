from fastapi import APIRouter, BackgroundTasks
from model.schema import *
from services.fetcher_service import *
from services.db_service import *

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
    new_search_data = run_web_scraping_workflow(location)
    print("6")
    # 4. 【寫入DB】景點名稱、照片、敘述
    background_tasks.add_task(save_basic_spot_data, new_search_data)
    print("7")
    # 5. 【寫入DB】景點經緯度
    background_tasks.add_task(update_spot_coordinates)
    print("8")
    # 6. 【回給前端
    return {"message": "new_search_data", "data": new_search_data}
