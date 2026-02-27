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
            day_rows.append(trip_id, i, date)
        
        cur.executemany("INSERT INTO trip_days(trip_id, day_index, date)", day_rows)

        # 3) places: google_place_id -> destination_id
        #    一次查出所有 destination_id（避免 N 次 SQL）
        gpids = [p.google_place_id for p in payload.places]
        placeholder = ",".join(["%s"] * len(gpids))
        # ["%s"] * 3：產生一個包含 3 個字串的列表：['%s', '%s', '%s']。
        # ",".join(...)：用逗號把列表接起來，變成一個字串："%s,%s,%s"。

        cur.execute(
            f"SELECT id, google_map_id FROM destinations WHERE google_map_id IN ({placeholder})",
            (gpids,)
        )
        rows = cur.fetchall()
        found = {r["gooogle_map_id"]: r["id"] for r in rows}
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
