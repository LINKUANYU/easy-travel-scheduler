from fastapi import APIRouter, Depends, HTTPException
from model.schema import *
from services.db_service import get_cur
from pymysql import IntegrityError

router = APIRouter()

# 確保這個 天數 有在這份 trip 之中
def _ensure_trip_day(cur, trip_id: int, day_index: int):
    cur.execute("SELECT 1 FROM trip_days WHERE trip_id=%s AND day_index=%s", (trip_id, day_index))
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Day not found")

# 確保這個景點有在這份 trip 之中
def _ensure_trip_place(cur, trip_id: int, destination_id: int):
    cur.execute("SELECT 1 FROM trip_places WHERE trip_id=%s AND destination_id=%s", (trip_id, destination_id))
    if not cur.fetchone():
        raise HTTPException(status_code=400, detail="Place is not in trip_places")

# 讀：該份trip的某一天的行程
@router.get(
    "/api/trips/{trip_id}/days/{day_index}/itinerary",
    response_model=list[ItineraryItemOut]
)
def get_day_itinerary(trip_id: str, day_index: str, cur = Depends(get_cur)):
    day_index = int(day_index)
    trip_id = int(trip_id)
    _ensure_trip_day(cur, trip_id, day_index)

    cur.execute(
        """
        SELECT
          ii.id AS item_id,
          ii.trip_id,
          ii.day_index,
          ii.position,
          d.id AS destination_id,
          d.place_name,
          d.lat,
          d.lng,
          d.google_place_id
        FROM itinerary_items ii
        JOIN destinations d ON d.id = ii.destination_id
        WHERE ii.trip_id=%s AND ii.day_index=%s
        ORDER BY ii.position ASC
        """,
        (trip_id, day_index)
    )
    rows = cur.fetchall() or []
    return rows

# 讀：Trip 行程 summary（用來讓景點池按鈕變成「已加入」）
@router.get(
    "/api/trips/{trip_id}/itinerary/summary",
    response_model=list[ItinerarySummaryRow],
)
def get_itinerary_summary(trip_id: int, cur=Depends(get_cur)):
    cur.execute(
        """
        SELECT
          destination_id,
          day_index,
          position,
          id AS item_id
        FROM itinerary_items
        WHERE trip_id=%s
        """,
        (trip_id,),
    )
    rows = cur.fetchall() or []
    return rows


# 寫：把景點id 加入行程（append 到最下方）
@router.post(
    "/api/trips/{trip_id}/days/{day_index}/itinerary",
    response_model=ItineraryItemOut,
)
def add_to_day_itinerary(trip_id: int, day_index: int, payload: ItineraryAddIn, cur=Depends(get_cur)):
    destination_id = payload.destination_id

    _ensure_trip_day(cur, trip_id, day_index)
    _ensure_trip_place(cur, trip_id, destination_id)

    try:
        # 取得當天最後一個 position（鎖住該 day 的尾端，避免競態）
        cur.execute(
            """
            SELECT position
            FROM itinerary_items
            WHERE trip_id=%s AND day_index=%s
            ORDER BY position DESC
            LIMIT 1
            FOR UPDATE
            """,
            (trip_id, day_index),
        )
        # FOR UPDATE：這會在地圖執行 SELECT 時，強行鎖住符合條件的資料列。
        # 效果：如果 A 請求正在計算位置，B 請求必須在旁邊「排隊」，直到 A 請求完成 INSERT 並 commit 後，B 才會讀到最新的 position 並接下去算。
        # 這確保了行程的順序 (position) 永遠是連續的 0, 1, 2...，不會出現重複或跳號。
        
        last = cur.fetchone()
        new_pos = (last["position"] + 1) if last else 0

        # 以新的排序和景點id 插入同一份trip的同一天
        cur.execute(
            """
            INSERT INTO itinerary_items (trip_id, day_index, destination_id, position)
            VALUES (%s, %s, %s, %s)
            """,
            (trip_id, day_index, destination_id, new_pos),
        )
        item_id = cur.lastrowid

        # 回傳 join 後的destinations 詳細資料
        cur.execute(
            """
            SELECT
              ii.id AS item_id,
              ii.trip_id,
              ii.day_index,
              ii.position,
              d.id AS destination_id,
              d.place_name,
              d.lat,
              d.lng,
              d.google_place_id
            FROM itinerary_items ii
            JOIN destinations d ON d.id = ii.destination_id
            WHERE ii.id=%s
            """,
            (item_id,),
        )
        row = cur.fetchone()
        return row

    except IntegrityError as e:
        # Duplicate key（UNIQUE(trip_id,destination_id)）
        if len(e.args) >= 1 and e.args[0] == 1062:
            raise HTTPException(status_code=409, detail="Place already scheduled in this trip")
        raise



# 寫：刪除行程內的景點 id
@router.delete(
    "/api/trips/{trip_id}/itinerary/{item_id}",
    response_model=OkOut,
)
def remove_itinerary_item(trip_id: int, item_id: int, cur=Depends(get_cur)):

    cur.execute("SELECT trip_id FROM itinerary_items WHERE id=%s", (item_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    if row["trip_id"] != trip_id:
        raise HTTPException(status_code=400, detail="Trip mismatch")

    cur.execute("DELETE FROM itinerary_items WHERE id=%s", (item_id,))

    return {"ok": True}