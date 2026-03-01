from fastapi import APIRouter, Depends, Request, Response, HTTPException
import pymysql
from pymysql.err import IntegrityError
from services.db_service import *
from model.schema import *
from datetime import timedelta

router = APIRouter()

@router.post("/api/trips", response_model=TripCreateOut)
def create_trip(payload: TripCreateIn, cur = Depends(get_cur)):
    if not payload.places:
        raise HTTPException(status_code=400, detail="place is empty")
    
    try:
        # 1) 建立 trips
        cur.execute(
            """
            INSERT INTO trips(user_id, title, days, start_date)
            VALUES(NULL, %s, %s, %s)
            """
            , (payload.title, payload.days, payload.start_date)
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
        return {"trip_id": trip_id}
    except pymysql.MySQLError as e:
        print(f"Database error: {e}，trips建立失敗")


# ====== 先留一個「擁有權檢查」的鉤子（目前先放行）======
def assert_trip_owner():
    # TODO(stage later): 檢查 owner_token cookie 與 DB owner_token_hash
    return True


@router.get("/api/trips/{trip_id}", response_model=TripOut, dependencies=[Depends(assert_trip_owner)])
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