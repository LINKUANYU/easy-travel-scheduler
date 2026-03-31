import pymysql
from pymysql.err import IntegrityError
from fastapi import HTTPException
from services.geo_service import *

def get_existing_destinations(location, cur):
    try:
        sql_search = """
            SELECT 
                id,
                input_region, 
                city_name as city, 
                place_name as attraction, 
                description, 
                geo_tags, 
                google_place_id, 
                lat, 
                lng
            FROM destinations
            WHERE source = 'ai'
            AND (
                    input_region = %s 
                OR geo_tags LIKE %s
                OR city_name LIKE %s 
                
            )
        """

        search_patten = f"%{location}%"
        cur.execute(sql_search, (location, search_patten, search_patten,))
        rows = cur.fetchall()

        final_data = []
        for row in rows:
                final_data.append({
                    "id": row['id'],
                    "input_region": row['input_region'],
                    "city": row['city'],
                    "attraction": row['attraction'],
                    "description": row['description'],
                    "geo_tags": row['geo_tags'],
                    "google_place_id": row['google_place_id'],
                    # 轉為 float 以匹配 Pydantic 模型
                    "lat": float(row['lat']) if row['lat'] else None,
                    "lng": float(row['lng']) if row['lng'] else None,
                })

        return final_data

    except pymysql.MySQLError as e:
        print(f"Database error: {e}，查詢資料庫既有景點失敗")
        raise HTTPException(status_code=500, detail="查詢資料庫既有景點失敗")





def save_spot_data(data, cur):
    insert_data = []

    dest_sql = """
        INSERT INTO destinations
            (input_region, city_name, place_name, description, geo_tags, google_place_id, lat, lng, address) 
        VALUES(%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    for item in data:
        try:
            cur.execute(
                dest_sql,
                    (
                        item.get('input_region'),
                        item.get('city'),
                        item.get('attraction'),
                        item.get('description'),
                        item.get('geo_tags'),
                        item.get('google_place_id'),
                        item.get('lat'),
                        item.get('lng'),
                        item.get('address')
                    )
                )
            dest_id = cur.lastrowid  # ✅ 只有成功 INSERT 才會有有效 id

            # 將新增過item['id']的資料回傳
            item["id"] = dest_id
            insert_data.append(item)

        except IntegrityError as e:
            # 1062 = Duplicate entry（google_place_id 重複）
            if e.args and e.args[0] == 1062:
                # 直接跳過：不新增、不更新
                continue
            print(f"Database error: {e}，景點資料寫入DB失敗")
            raise HTTPException(status_code=500, detail="景點資料寫入DB失敗")
        except pymysql.MySQLError as e:
            print(f"Database error: {e}，景點資料寫入DB失敗")
            raise HTTPException(status_code=500, detail="景點資料寫入DB失敗")

    print(f"成功寫入 {len(insert_data)} 筆景點")
    return insert_data




