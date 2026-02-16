from dbutils.pooled_db import PooledDB
import pymysql
from fastapi import Depends, HTTPException
import os
import sys
from services.geo_service import *


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
        raise HTTPException(status_code=500, detail="資料庫連線失敗")
    except Exception as e:
        # 捕捉其他非預期錯誤 (如連線池滿了且等待超時)
        print(f"取得連線時發生非預期錯誤: {e}")
        raise HTTPException(status_code=500, detail="取得連線時發生非預期錯誤")
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
            SELECT 
                d.id,
                d.input_region, 
                d.city_name as city, 
                d.place_name as attraction, 
                d.description, 
                d.geo_tags, 
                d.google_place_id, 
                d.lat, 
                d.lng, 
                p.photo_url as url,
                p.source_url as source
            FROM destinations d
            LEFT JOIN destination_photos p ON d.id = p.destination_id
            WHERE input_region = %s 
            OR city_name LIKE %s 
            OR geo_tags LIKE %s
        """

        search_patten = f"%{location}%"
        cur.execute(sql_search, (location, search_patten, search_patten,))
        rows = cur.fetchall()

        spots_dict = {}
        for row in rows:
            spots_id = row['id']
            # 如果這個id還不存在字典裡，初始化他
            if spots_id not in spots_dict:
                spots_dict[spots_id] = {
                    "id": spots_id,
                    "input_region": row['input_region'],
                    "city": row['city'],
                    "attraction": row['attraction'],
                    "description": row['description'],
                    "geo_tags": row['geo_tags'],
                    "google_place_id": row['google_place_id'],
                    # 轉為 float 以匹配 Pydantic 模型
                    "lat": float(row['lat']) if row['lat'] else None,
                    "lng": float(row['lng']) if row['lng'] else None,
                    "images": []
                }
            if row['url']:
                spots_dict[spots_id]['images'].append({
                    'url': row['url'],
                    'source': row['source']
                })

        # 只回傳字典的 Values 部分（轉回 List）
        return list(spots_dict.values())

    except pymysql.MySQLError as e:
        print(f"Database error: {e}，查詢資料庫既有景點失敗")
        raise HTTPException(status_code=500, detail="查詢資料庫既有景點失敗")
    finally:
        cur.close()
        conn.close()

def save_spot_data(data):
    conn = POOL.connection()

    try:
        cur = conn.cursor()
        insert_data = []

        for item in data:
            # 1. 使用 INSERT IGNORE：若 google_place_id 重複則直接跳過
            dest_sql = """
                INSERT IGNORE INTO destinations
                    (input_region, city_name, place_name, description, geo_tags, google_place_id, lat, lng) 
                VALUES(%s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                description = VALUES(description)
            """
            cur.execute(dest_sql, (item.get('input_region'),item.get('city'), item.get('attraction'), item.get('description'), item.get('geo_tags'), item.get('google_place_id'), item.get('lat'), item.get('lng')))
            
            # 2. 檢查是否真的有資料被寫入 (rowcount > 0)
            if cur.rowcount > 0:
                dest_id = cur.lastrowid            
                # --- 將 id 塞回 item 物件中 ---
                item['id'] = dest_id
            
                # 3. 針對該景點的所有圖片，使用 executemany
                images = item.get('images', [])
                if images:
                    img_sql = "INSERT INTO destination_photos(destination_id, photo_url, source_url) VALUES(%s, %s, %s)"
                    img_insert_data = [(dest_id, img.get('url'), img.get('source')) for img in images]
                    cur.executemany(img_sql, img_insert_data)
                
                # 將新增過item['id']的資料回傳
                insert_data.append(item)
            else:
                print(f"發現重複景點{item.get('attraction')}，跳過資料")
        conn.commit()
        print(f"成功寫入 {len(insert_data)} 筆景點及圖片")
        return insert_data # 將新增過item['id']的資料回傳
    except pymysql.MySQLError as e:
        conn.rollback() 
        print(f"Database error: {e}，景點資料寫入DB失敗")
        raise HTTPException(status_code=500, detail="景點資料寫入DB失敗")
    finally:
        conn.close()
        



# def update_spot_coordinates():
#     conn = POOL.connection()
#     cur = conn.cursor(pymysql.cursors.DictCursor)
    
#     try:
#         query_sql = """
#             SELECT id, place_name FROM destinations 
#             WHERE google_place_id is NULL 
#                 OR lat is NULL
#                 OR lng is NULL
#         """
#         cur.execute(query_sql)
#         rows = cur.fetchall()

#         success_count = 0
#         duplicate_count = 0
#         for row in rows:
#             target_id = row['id']
#             place_name = row['place_name']
#             lat, lng, google_place_id = get_coordinates(place_name)
        
#             if lat and lng and google_place_id:
#                 try:
#                     update_sql = "UPDATE destinations SET lat = %s, lng = %s, google_place_id = %s WHERE id = %s"
#                     cur.execute(update_sql, (lat, lng, google_place_id, target_id))
#                     conn.commit()
#                     success_count += 1
#                 except pymysql.err.IntegrityError as e:
#                     # 3. 捕捉 1062 衝突錯誤：代表這個 google_place_id 已經在別的 id 存在了，用來嚴格檢查是否重複景點
#                     if e.args[0] == 1062:
#                         conn.rollback() # 先回滾錯誤的更新動作
#                         cur.execute("DELETE FROM destinations WHERE id = %s", (target_id,))
#                         conn.commit()
#                         print(f"發現重複景點「{place_name}」，清理多餘欄位ID: {target_id}")
#                         duplicate_count += 1
#                     else:
#                         raise e
        
#         print(f"成功寫入 {success_count} / {len(rows)} 筆景點地圖資料，移除重複資料{duplicate_count} 筆")

#     except Exception as e:
#         conn.rollback()
#         print(f"Database error: {e}，景點地圖資料更新失敗")
#         raise HTTPException(status_code=500, detail="景點地圖資料更新失敗")
#     finally:
#         cur.close()
#         conn.close()

