import os
import requests
import json
from dotenv import load_dotenv
load_dotenv()
from db.database import *

MAPS_API_KEY = os.getenv("MAPS_API_KEY")

def get_coordinates(location_name):
    if not MAPS_API_KEY:
        print("❌ 錯誤：找不到 MAPS_API_KEY，請檢查你的 .env 檔案！")
        return None, None, None
    

    url = "https://places.googleapis.com/v1/places:searchText"
    
    # 設定 Header，這裡就是「新版」的關鍵：Field Mask
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": MAPS_API_KEY,
        "X-Goog-FieldMask": "places.location,places.id,places.displayName" 
    }
    
    # 請求主體
    data = {
        "textQuery": location_name,
        "languageCode": "zh-TW"
    }
    
    response = requests.post(url, headers=headers, json=data)
    
    if response.status_code == 200:
        result = response.json()
        if "places" in result and len(result["places"]) > 0:
            place = result["places"][0]
            lat = place["location"]["latitude"]
            lng = place["location"]["longitude"]
            place_id = place["id"]
            return lat, lng, place_id
    
    return None, None, None


def write_into_db_s2():
    # 因測試用沒有用Fastapi所以先不用Depends
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

