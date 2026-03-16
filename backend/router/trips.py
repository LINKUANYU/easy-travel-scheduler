from fastapi import APIRouter, Depends, HTTPException
import pymysql
from services.db_service import *
from model.schema import *
from datetime import timedelta
from services.helper_auth import get_current_user, assert_trip_owner
import secrets

router = APIRouter()

@router.post("/api/trips", response_model=TripCreateOut)
def create_trip(payload: TripCreateIn, cur = Depends(get_cur)):
    try:
        # 產生 64 字元的 token
        edit_token = secrets.token_hex(32)

        # 1) 建立 trips
        cur.execute(
            """
            INSERT INTO trips(user_id, title, days, start_date, edit_token)
            VALUES(NULL, %s, %s, %s, %s)
            """
            , (payload.title, payload.days, payload.start_date, edit_token)
        )
        trip_id = cur.lastrowid
        
        # 2) 建立 trip_days（有 start_date 才填 date）
        day_rows = []
        for i in range(1, payload.days + 1):
            date = None
            if payload.start_date:
                date = payload.start_date + timedelta(days = i - 1) # 拿每天的日期
            day_rows.append((trip_id, i, date))
        
        cur.executemany("INSERT INTO trip_days(trip_id, day_index, date) VALUES(%s, %s, %s)", day_rows)
        
        # 3) places: google_place_id -> destination_id
        if payload.places:
            #    一次查出所有 destination_id（避免 N 次 SQL）
            gpids = [p.google_place_id for p in payload.places]
            placeholder = ",".join(["%s"] * len(gpids))
            # ["%s"] * 3：產生一個包含 3 個字串的列表：['%s', '%s', '%s']。
            # ",".join(...)：用逗號把列表接起來，變成一個字串："%s,%s,%s"。
            
            sql = f"SELECT id, google_place_id FROM destinations WHERE google_place_id IN ({placeholder})"
            cur.execute(sql, gpids)
            rows = cur.fetchall()
            found = {r["google_place_id"]: r["id"] for r in rows}
            missing = [g for g in gpids if g not in found] # 找出有沒有gpid 是沒有 id的
            if missing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Some places not found in DB: {missing[:3]}{'...' if len(missing)>3 else ''}"
                )
            
            insert_rows = [(trip_id, found[g]) for g in gpids]
            # 去重：trip_places PK (trip_id, destination_id) 會擋，這裡用 INSERT IGNORE 更友善
            cur.executemany(
                "INSERT IGNORE INTO trip_places (trip_id, destination_id) VALUES (%s, %s)",
                insert_rows,
            )
        return {"trip_id": trip_id, "edit_token": edit_token}
    except pymysql.MySQLError as e:
        print(f"Database error: {e}，trips建立失敗")


@router.get("/api/trips/{trip_id}", 
    response_model=TripOut, 
    dependencies=[Depends(assert_trip_owner)],
)
def get_trip(trip_id: int, cur=Depends(get_cur)):
    cur.execute(
        """
        SELECT id AS trip_id, title, days,
               DATE_FORMAT(start_date, '%%Y-%%m-%%d') AS start_date
        FROM trips
        WHERE id = %s
        """,
        (trip_id,),
    )
    row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Trip not found")

    # start_date 可能是 None，OK
    return row

@router.get("/api/trips/{trip_id}/places",
    response_model=List[TripPlaceOut],
    dependencies=[Depends(assert_trip_owner)],
)
def get_trip_places(trip_id: int, cur=Depends(get_cur)):
    # 先確認 trip 存在（避免回空但其實是 trip 不存在）
    cur.execute("SELECT 1 FROM trips WHERE id=%s", (trip_id,))
    exists = cur.fetchone()
    if not exists:
        raise HTTPException(status_code=404, detail="Trip not found")

    # 取景點池 + destination 基本資料 + 第一張圖片當 cover（可選）
    cur.execute(
        """
        SELECT
          tp.destination_id,
          d.place_name,
          d.city_name,
          d.google_place_id,
          d.lat,
          d.lng,
          (
            SELECT dp.photo_url
            FROM destination_photos dp
            WHERE dp.destination_id = d.id
            ORDER BY dp.id ASC
            LIMIT 1
          ) AS cover_url
        FROM trip_places tp
        JOIN destinations d ON d.id = tp.destination_id
        WHERE tp.trip_id = %s
        ORDER BY tp.destination_id DESC
        """,
        (trip_id,),
    )
    rows = cur.fetchall()
    return rows


@router.post(
    "/api/trips/{trip_id}/places",
    response_model=TripPlaceOut,
    dependencies=[Depends(assert_trip_owner)],
)
def add_trip_place(trip_id: int, payload: AddTripPlaceIn, cur=Depends(get_cur)):
    gpid = payload.google_place_id.strip()
    if not gpid:
        raise HTTPException(status_code=400, detail="google_place_id is required")


    # 1) 確認 trip 存在
    cur.execute("SELECT 1 FROM trips WHERE id=%s", (trip_id,))
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Trip not found")

    # 2) 找 destination（用 google_place_id unique）
    cur.execute("SELECT id FROM destinations WHERE google_place_id=%s", (gpid,))
    dest = cur.fetchone()

    if not dest:
        # 3) 不存在就建立一筆最小 destination（先不串 Places Details）
        #    之後你把 Autocomplete 接上時，把 place_name/city/lat/lng 一起送進來即可
        details = fetch_place_details_new(gpid)
        cur.execute(
            """
            INSERT INTO destinations
            (source, place_name, city_name, address, google_place_id, lat, lng,
            input_region, geo_tags, description)
            VALUES
            ('manual', %s, %s, %s, %s, %s, %s,
            NULL, NULL, NULL)
            """,
            (
                details["place_name"],
                details["city_name"],
                details["address"],
                gpid,
                details["lat"],
                details["lng"],
            ),
        )
        destination_id = cur.lastrowid
    else:
        destination_id = dest["id"]

    # 4) link trip_places（用 UNIQUE(trip_id, destination_id) 擋重複）
    try:
        cur.execute(
            """
            INSERT INTO trip_places (trip_id, destination_id)
            VALUES (%s, %s)
            """,
            (trip_id, destination_id),
        )
    except Exception as e:
        # 如果你有設 unique，重複插入會在這裡炸；我們轉成「已存在也算成功」
        # PyMySQL 的 IntegrityError 你也可以精準抓 (pymysql.err.IntegrityError)
        pass

    # 5) 回傳這筆 place（join destination）
    cur.execute(
        """
        SELECT
          d.id AS destination_id,
          d.place_name,
          d.city_name,
          d.google_place_id,
          d.lat,
          d.lng,
          (
            SELECT dp.photo_url
            FROM destination_photos dp
            WHERE dp.destination_id = d.id
            ORDER BY dp.id ASC
            LIMIT 1
          ) AS cover_url
        FROM destinations d
        WHERE d.id=%s
        """,
        (destination_id,),
    )
    row = cur.fetchone()

    return row


@router.delete(
    "/api/trips/{trip_id}/places/{destination_id}",
    response_model=OkOut,
    dependencies=[Depends(assert_trip_owner)],
)
def remove_trip_place(trip_id: int, destination_id: int, cur=Depends(get_cur)):

    # trip 存在性（可選）
    cur.execute("SELECT 1 FROM trips WHERE id=%s", (trip_id,))
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Trip not found")

    cur.execute(
        "DELETE FROM trip_places WHERE trip_id=%s AND destination_id=%s",
        (trip_id, destination_id),
    )
    affected = cur.rowcount

    # 刪不到也回 ok（前端 UX 比較順）
    return {"ok": True}


@router.patch("/api/trips/{trip_id}/bind")
async def bind_trip_to_user(
    trip_id: int,
    current_user: dict = Depends(get_current_user), # 必須有 Session 才能打這支 API
    cur = Depends(get_cur)
):
    # 1. 查詢該行程的當前擁有者
    cur.execute("SELECT user_id FROM trips WHERE id = %s", (trip_id,))
    trip = cur.fetchone()

    if not trip:
        raise HTTPException(status_code=404, detail="找不到行程")
    
    # 2. 判斷綁定邏輯
    if trip["user_id"] is not None:
        if trip["user_id"] == current_user["id"]:
            return {"message": "此行程已在您帳號下"}
        else:
            raise HTTPException(status_code=403, detail="認領失敗，此行程已被其他帳號綁定")

    # 3. 執行綁定(寫入user_id)
    try:
        cur.execute("UPDATE trips SET user_id = %s WHERE id = %s", (current_user["id"], trip_id))
        
        return {"message": "行程認領成功", "trip_id": trip_id}
    except Exception as e:
        print(f'Database error: {e}')
        raise HTTPException(status_code=500, detail="資料庫寫入失敗（行程認領）")

