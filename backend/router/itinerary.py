from fastapi import APIRouter, Depends, HTTPException
from schemas.itinerary import *
from schemas.schemas import OkOut
from core.database import get_cur, get_conn
from pymysql import IntegrityError
from core.dependencies import assert_trip_owner

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

def _repack_day_position(cur, trip_id: int, day_index: int):
    cur.execute(
        """
        SELECT id, destination_id
        FROM itinerary_items
        WHERE trip_id = %s
        AND day_index = %s
        ORDER BY position ASC
    """, (trip_id, day_index)
    )
    rows = cur.fetchall()

    for pos, r in enumerate(rows):
        cur.execute("UPDATE itinerary_items SET position = %s WHERE id = %s", (pos, r["id"]))

# 讀：該份trip的某一天的行程
@router.get(
    "/api/trips/{trip_id}/days/{day_index}/itinerary",
    response_model=list[ItineraryItemOut],
    dependencies=[Depends(assert_trip_owner)],
)
def get_day_itinerary(trip_id: int, day_index: int, cur = Depends(get_cur)):
    _ensure_trip_day(cur, trip_id, day_index)

    cur.execute(
        """
        SELECT
            ii.id AS item_id,
            ii.trip_id,
            ii.day_index,
            ii.position,
            ii.arrival_time,
            ii.departure_time,
            d.id AS destination_id,
            d.place_name,
            d.lat,
            d.lng,
            d.google_place_id,
            leg.travel_mode,
            leg.duration_millis,
            leg.distance_meters
        FROM itinerary_items ii
        JOIN destinations d ON d.id = ii.destination_id
        LEFT JOIN itinerary_legs leg ON leg.from_item_id = ii.id
        WHERE ii.trip_id=%s AND ii.day_index=%s
        ORDER BY ii.position ASC
        """,
        (trip_id, day_index)
    )
    rows = cur.fetchall() or []

    for row in rows:
        if row.get("arrival_time") is not None:
            # 取得總秒數，轉換成 HH:MM 格式的字串 (例如 "09:00")
            seconds = int(row["arrival_time"].total_seconds())
            h, m = seconds // 3600, (seconds % 3600) // 60
            row["arrival_time"] = f"{h:02d}:{m:02d}"
            
        if row.get("departure_time") is not None:
            seconds = int(row["departure_time"].total_seconds())
            h, m = seconds // 3600, (seconds % 3600) // 60
            row["departure_time"] = f"{h:02d}:{m:02d}"

    return rows

# 讀：Trip 行程 summary（用來讓景點池按鈕變成「已加入」）
@router.get(
    "/api/trips/{trip_id}/itinerary/summary",
    response_model=list[ItinerarySummaryRow],
    dependencies=[Depends(assert_trip_owner)],
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
    dependencies=[Depends(assert_trip_owner)]
)
def add_to_day_itinerary(trip_id: int, day_index: int, payload: ItineraryAddIn, cur=Depends(get_cur), conn = Depends(get_conn)):

    destination_id = payload.destination_id
    _ensure_trip_day(cur, trip_id, day_index)
    _ensure_trip_place(cur, trip_id, destination_id)
    _repack_day_position(cur, trip_id, day_index)  # 保險先把排序重新壓縮
    try:
        conn.begin()
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
                ii.arrival_time,
                ii.departure_time,
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
    dependencies=[Depends(assert_trip_owner)]
)
def remove_itinerary_item(trip_id: int, item_id: int, cur=Depends(get_cur), conn=Depends(get_conn)):

    cur.execute("SELECT trip_id, day_index FROM itinerary_items WHERE id=%s", (item_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    if row["trip_id"] != trip_id:
        raise HTTPException(status_code=400, detail="Trip mismatch")

    day_index = row["day_index"]
    conn.begin()
    cur.execute("DELETE FROM itinerary_items WHERE id=%s", (item_id,))

    _repack_day_position(cur, trip_id, day_index)  # 刪除後排序重新壓縮

    return {"ok": True}


# 更新：更新某天行程內景點的排序
@router.put(
    "/api/trips/{trip_id}/days/{day_index}/itinerary/reorder",
    response_model=OkOut,
    dependencies=[Depends(assert_trip_owner)]
)
def reorder_day_itinerary(trip_id: int, day_index: int, payload: ItineraryReorderIn, cur=Depends(get_cur)):
    # ordered 前端送進來已排序好的item_id
    ordered = payload.ordered_item_ids
    if not ordered:
        raise HTTPException(status_code=400, detail="ordered_item_ids is required")

    try:
        # FOR UPDATE 鎖住該 day 的 itinerary items（避免競態）
        cur.execute(
            """
            SELECT id FROM itinerary_items
            WHERE trip_id =%s AND day_index = %s
            FOR UPDATE
        """,
        (trip_id, day_index)
        )
        rows = cur.fetchall() or []
        existing_ids = [r["id"] for r in rows]

        # 防呆：前端送來的 ids 必須與目前 day 的 ids 完全一致（不多不少）
        if set(existing_ids) != set(ordered):  # set集合，裡面的元素不能重複（會自動去重）。
            raise HTTPException(status_code=400, detail="ordered_item_ids mismatch")
        
        
        update_rows = []
        # 依照每個item_id 的位置 更新他們的position
        for pos, item_id in enumerate(ordered):
            update_rows.append((pos, item_id))

        cur.executemany(
            """
            UPDATE itinerary_items
            SET position = %s
            WHERE id = %s AND trip_id = %s AND day_index = %s
            """,
            [(pos, item_id, trip_id, day_index) for (pos, item_id) in update_rows]
        )

        return {"ok": True}
    except HTTPException:
        raise
    except Exception:
        raise



@router.put(
    "/api/trips/{trip_id}/days/{day_index}/itinerary/save",
    response_model=OkOut,
    dependencies=[Depends(assert_trip_owner)]
)
def save_day_itinerary(
    trip_id: int,
    day_index: int,
    payload: ItinerarySaveDayIn,
    cur=Depends(get_cur),
    conn=Depends(get_conn),
):
    ordered = payload.ordered_item_ids or []
    if not ordered:
        raise HTTPException(status_code=400, detail="ordered_item_ids is required")

    # 1) 鎖住該天 itinerary items
    conn.begin()
    cur.execute(
        """
        SELECT id
        FROM itinerary_items
        WHERE trip_id = %s AND day_index = %s
        FOR UPDATE
        """,
        (trip_id, day_index),
    )
    rows = cur.fetchall() or []
    existing_ids = [r["id"] for r in rows]

    # 2) 驗證 item 集合一致
    if set(existing_ids) != set(ordered):
        raise HTTPException(status_code=400, detail="ordered_item_ids mismatch")

    # 3) 更新排序
    cur.executemany(
        """
        UPDATE itinerary_items
        SET position = %s
        WHERE id = %s AND trip_id = %s AND day_index = %s
        """,
        [(pos, item_id, trip_id, day_index) for pos, item_id in enumerate(ordered)],
    )

    # 4) 更新 item 時間
    time_rows = []
    for row in payload.item_times:
        time_rows.append((
            row.arrival_time,
            row.departure_time,
            row.item_id,
            trip_id,
            day_index,
        ))

    if time_rows:
        cur.executemany(
            """
            UPDATE itinerary_items
            SET arrival_time = %s, departure_time = %s
            WHERE id = %s AND trip_id = %s AND day_index = %s
            """,
            time_rows,
        )

    # 5) 清掉舊 legs
    cur.execute(
        """
        DELETE FROM itinerary_legs
        WHERE trip_id = %s AND day_index = %s
        """,
        (trip_id, day_index),
    )

    # 6) 重建 legs
    leg_rows = []
    for leg in payload.legs:
        leg_rows.append((
            trip_id,
            day_index,
            leg.from_item_id,
            leg.to_item_id,
            leg.travel_mode,
            leg.duration_millis,
            leg.distance_meters,
        ))

    if leg_rows:
        cur.executemany(
            """
            INSERT INTO itinerary_legs (
                trip_id,
                day_index,
                from_item_id,
                to_item_id,
                travel_mode,
                duration_millis,
                distance_meters
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            leg_rows,
        )

    return {"ok": True}