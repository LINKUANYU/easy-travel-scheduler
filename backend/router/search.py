from fastapi import APIRouter, BackgroundTasks
from model.spot import *
from services.search_api_v2_test import *
from db.database import *
from model.search_data_db import *
from services.stage3_map import *

router = APIRouter()

@router.post("/api/search", response_model=SearchResponse)
async def search_spot(
    payload: SearchRequest,
    background_tasks: BackgroundTasks,
    cur = Depends(get_cur)
):
    location = payload.location
    
    # 1.【搜尋】階段：多欄位模糊比對 (向上支援與向下支援的關鍵)
    # 我們同時找：輸入區域、城市名稱、以及標籤內是否包含關鍵字
    sql_search = """
        SELECT city_name as city, place_name as attraction, description, geo_tags
        FROM destinations 
        WHERE input_region = %s 
           OR city_name LIKE %s 
           OR geo_tags LIKE %s
    """

    search_patten = f"%{location}%"
    print("1")
    cur.execute(sql_search, (location, search_patten, search_patten,))
    existing_spots_data = cur.fetchall()
    print("2")
    # 2. 【門檻檢查】：如果有 10 個以上景點，直接回傳，省下 Gemini 費用
    if len(existing_spots_data) >= 10:
        # 組合資料回給前端
        print(f"資料庫足夠的「{location}」資料")
        return {"message": "existing_spots_data", "data": existing_spots_data}

    # 3.【資料不足】叫整套搜尋API補完資料
    new_search_data = search_api(location)
    print("6")
    # 4. 【寫入DB】景點名稱、照片、敘述
    background_tasks.add_task(write_into_db_s1, new_search_data)
    print("7")
    # 5. 【寫入DB】景點經緯度
    background_tasks.add_task(write_into_db_s2)
    print("8")
    # 6. 【回給前端
    return {"message": "new_search_data", "data": new_search_data}
