import secrets
from fastapi import APIRouter, Depends, HTTPException
from pymysql.cursors import DictCursor
from services.db_service import get_cur
from model.schema import *

router = APIRouter()
@router.patch("/api/trips/{trip_id}/share")
async def enable_trip_sharing(trip_id: int, cur: DictCursor = Depends(get_cur)):
    # 1. 查詢資料庫確認行程是否存在，並取得目前的 share_token
    cur.execute("SELECT id, share_token FROM trips WHERE id = %s", (trip_id,))
    trip = cur.fetchone()
    
    if not trip:
        raise HTTPException(status_code=404, detail="找不到該行程")

    share_token = trip['share_token']
    
    # 2. 如果還沒有 token，才產生並寫入資料庫
    if not share_token:
        share_token = secrets.token_urlsafe(16) 
        try:
            # 這裡只更新 share_token，不需要管 is_public 了 (因為預設已是 1)
            cur.execute("""
                UPDATE trips 
                SET share_token = %s 
                WHERE id = %s
            """, (share_token, trip_id))
        except Exception as e:
            print(f"Database error: {e}，分享 Token 寫入失敗")
            raise HTTPException(status_code=500, detail="資料庫寫入失敗")

    # 3. 回傳 token 給前端
    return {
        "message": "分享連結已獲取",
        "share_token": share_token
    }



@router.get("/api/share/{token}", response_model=SharedTripDataOut)
async def get_shared_trip_data(token: str, cur: DictCursor = Depends(get_cur)):
    # 1. 透過 token 取得行程基本資訊
    cur.execute("""
        SELECT id AS trip_id, title, days, DATE_FORMAT(start_date, '%%Y-%%m-%%d') AS start_date
        FROM trips 
        WHERE share_token = %s
    """, (token,))
    trip = cur.fetchone()
    
    if not trip:
        raise HTTPException(status_code=404, detail="找不到該分享行程或連結已失效")
        
    trip_id = trip['trip_id']
    
    # 2. 取得該行程「所有」已排入的景點資料
    cur.execute("""
        SELECT
            ii.id AS item_id,
            ii.day_index,
            ii.position,
            ii.arrival_time,
            ii.departure_time,
            d.id AS destination_id,
            d.place_name,
            d.lat,
            d.lng,
            d.google_place_id,
            l.travel_mode,
            l.duration_millis,
            l.distance_meters
        FROM itinerary_items ii
        JOIN destinations d ON d.id = ii.destination_id
        LEFT JOIN itinerary_legs l ON ii.id = l.from_item_id
        WHERE ii.trip_id = %s
        ORDER BY ii.day_index ASC, ii.position ASC
    """, (trip_id,))
    
    items = cur.fetchall() or []
    
    # 3. 格式化時間 (與你 itinerary.py 的處理邏輯一致)
    for row in items:
        if row.get("arrival_time") is not None:
            seconds = int(row["arrival_time"].total_seconds())
            h, m = seconds // 3600, (seconds % 3600) // 60
            row["arrival_time"] = f"{h:02d}:{m:02d}"
            
        if row.get("departure_time") is not None:
            seconds = int(row["departure_time"].total_seconds())
            h, m = seconds // 3600, (seconds % 3600) // 60
            row["departure_time"] = f"{h:02d}:{m:02d}"

    # 4. 將景點依照 day_index 進行分組，方便前端直接渲染成多個欄位
    # 建立一個字典：{ 1: [], 2: [], 3: [] ... }
    days_data = {i: [] for i in range(1, trip["days"] + 1)}
    
    for item in items:
        day_idx = item["day_index"]    # item 是哪一天的景點
        if day_idx in days_data:    # 對應到的天數存在
            days_data[day_idx].append(item)    # 把資料插進去 { 第一天： item }

    # 5. 回傳整理好的聚合資料
    return {
        "trip": trip,
        "itinerary": days_data
    }