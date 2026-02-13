from dbutils.pooled_db import PooledDB
import pymysql
from fastapi import Depends, HTTPException
import os
import sys
from services.geo_service import *

# RDS_KEY = os.getenv('RDS_KEY')

DB_HOST = os.getenv('DB_HOST')
DB_PORT = os.getenv('DB_PORT')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')

if not DB_PASSWORD:
    sys.exit("Critical Error: DB connect fail, missing access keys in environment variables.")

POOL = PooledDB(
    creator=pymysql,  # 使用 PyMySQL 作為驅動
    maxconnections=5,  # 連線池最大連線數
    mincached=2,       # 初始化時，池中至少存在的空閒連線數
    host=DB_HOST,
    user=DB_USER,
    password= DB_PASSWORD,
    database='easy-travel-scheduler',
    charset='utf8mb4',
    cursorclass=pymysql.cursors.DictCursor, # cursor() 就會回傳字典型態的資料了
    blocking=True      # 連線池滿了時，是否要等待（True 為等待）
)

def get_conn():
    conn = None
    try:
        # 因為 blocking=True，如果池滿了會在那裡等，不需要手動寫重試迴圈
        conn = POOL.connection() 
        yield conn
    except pymysql.MySQLError as e:
        # 捕捉資料庫層級的錯誤 (如帳密錯、連線超時)
        print(f"資料庫連線失敗: {e}")
        raise HTTPException(status_code=500, detail="Database connection failed")
    except Exception as e:
        # 捕捉其他非預期錯誤 (如連線池滿了且等待超時)
        print(f"取得連線時發生非預期錯誤: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")
    finally:
        if conn:
            conn.close()

def get_cur(conn = Depends(get_conn)):
    # 注意：你在 POOL 已經設定了 cursorclass=pymysql.cursors.DictCursor
    # 這裡直接呼叫 cursor() 就會回傳字典型態的資料了
    cur = conn.cursor()
    try:
        yield cur
    finally:
        cur.close()


def get_existing_destinations(location):
    conn = POOL.connection()
    try:
        cur = conn.cursor()
        sql_search = """
            SELECT city_name as city, place_name as attraction, description, geo_tags
            FROM destinations 
            WHERE input_region = %s 
            OR city_name LIKE %s 
            OR geo_tags LIKE %s
        """

        search_patten = f"%{location}%"
        cur.execute(sql_search, (location, search_patten, search_patten,))
        existing_spots_data = cur.fetchall()

        return existing_spots_data
    except pymysql.MySQLError as e:
        print(f"Database error: {e}，查詢資料庫既有景點失敗")
        raise HTTPException(status_code=500, detail="查詢資料庫既有景點失敗")
    finally:
        cur.close()
        conn.close()

def save_basic_spot_data(combine_data):
    conn = POOL.connection()

    try:
        cur = conn.cursor()

        for item in combine_data:
            # 插入單個景點的資訊
            dest_sql = "INSERT INTO destinations(input_region, city_name, place_name, description, geo_tags) VALUES(%s, %s, %s, %s, %s)"
            cur.execute(dest_sql, (item.get('input_region'),item.get('city'), item.get('attraction'), item.get('description'), item.get('geo_tags')))
            
            # 取得剛插入的景點id
            dest_id = cur.lastrowid
            
            # 3. 針對該景點的所有圖片，使用 executemany
            images = item.get('images', [])
            if images:
                img_sql = "INSERT INTO destination_photos(destination_id, photo_url, source_url) VALUES(%s, %s, %s)"
                img_insert_data = [(dest_id, img.get('url'), img.get('source')) for img in images]
                cur.executemany(img_sql, img_insert_data)
        
        conn.commit()
        print(f"成功寫入 {len(combine_data)} 筆景點及圖片")
    except pymysql.MySQLError as e:
        conn.rollback() 
        print(f"Database error: {e}，景點資料寫入DB失敗")
        raise HTTPException(status_code=500, detail="景點資料寫入DB失敗")
    finally:
        conn.close()
        



def update_spot_coordinates():
    conn = POOL.connection()
    cur = conn.cursor(pymysql.cursors.DictCursor)
    
    try:
        query_sql = """
            SELECT id, place_name FROM destinations 
            WHERE google_place_id is NULL 
                OR lat is NULL
                OR lng is NULL
        """
        cur.execute(query_sql)
        rows = cur.fetchall()

        success_count = 0
        for row in rows:
            id = row['id']
            place_name = row['place_name']
            lat, lng, google_place_id = get_coordinates(place_name)

            if lat and lng and google_place_id:
                update_sql = "UPDATE destinations SET lat = %s, lng = %s, google_place_id = %s WHERE id = %s"
                cur.execute(update_sql, (lat, lng, google_place_id, id))
                conn.commit()
                success_count += 1
        
        print(f"成功寫入 {success_count} / {len(rows)} 筆景點地圖資料")

    except pymysql.MySQLError as e:
        conn.rollback()
        print(f"Database error: {e}，景點地圖資料更新失敗")
        raise HTTPException(status_code=500, detail="景點地圖資料更新失敗")
    finally:
        cur.close()
        conn.close()

