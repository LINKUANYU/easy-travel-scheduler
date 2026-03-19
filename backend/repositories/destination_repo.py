import pymysql
from pymysql.err import IntegrityError
from fastapi import HTTPException
from services.geo_service import *

def get_existing_destinations(location, cur):
    try:
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
            WHERE d.source = 'ai'
            AND (
                    input_region = %s 
                OR city_name LIKE %s 
                OR geo_tags LIKE %s
            )
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





def save_spot_data(data, cur):
    insert_data = []

    dest_sql = """
        INSERT INTO destinations
            (input_region, city_name, place_name, description, geo_tags, google_place_id, lat, lng, address) 
        VALUES(%s, %s, %s, %s, %s, %s, %s, %s, %s)
    """

    img_sql = "INSERT INTO destination_photos(destination_id, photo_url, source_url) VALUES(%s, %s, %s)"        
        
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
            images = item.get("images") or []

            if images:
                # 針對該景點的所有圖片，使用 executemany
                img_insert_data = [(dest_id, img.get('url'), img.get('source')) for img in images]
                cur.executemany(img_sql, img_insert_data)

            # 將新增過item['id']的資料回傳
            item["id"] = dest_id
            insert_data.append(item)

        except IntegrityError as e:
            # 1062 = Duplicate entry（google_place_id 重複）
            if e.args and e.args[0] == 1062:
                # 直接跳過：不新增、不更新、照片也不插
                continue
            print(f"Database error: {e}，景點資料寫入DB失敗")
            raise HTTPException(status_code=500, detail="景點資料寫入DB失敗")
        except pymysql.MySQLError as e:
            print(f"Database error: {e}，景點資料寫入DB失敗")
            raise HTTPException(status_code=500, detail="景點資料寫入DB失敗")

    print(f"成功寫入 {len(insert_data)} 筆景點及圖片")
    return insert_data




