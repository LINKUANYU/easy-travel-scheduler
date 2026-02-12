import os
from google import genai
from google.genai import types
from google.genai.types import Tool, GenerateContentConfig
from dotenv import load_dotenv
load_dotenv()
import json
from ddgs import DDGS
from db.database import *
from fastapi import Depends
import re
import json

def write_into_db_s1(combine_data):
    # 因測試用沒有用Fastapi所以先不用Depends
    conn = POOL.connection()

    try:
        # 開啟事務 (有些連線池預設會幫你做，但手動更保險)
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
        
