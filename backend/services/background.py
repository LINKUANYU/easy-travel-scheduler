from core.database import POOL, set_utc
from ddgs import DDGS
import time, random, json


def generate_trip_cover_task(trip_id: int):
    """
    背景任務：計算出現最多次的城市，並抓取圖片更新封面
    """
    # ⚠️ 重要：背景任務必須自己重新建立資料庫連線
    conn = POOL.connection()
    set_utc(conn)
    cur = conn.cursor()
    
    try:
        # 1. 撈出該行程中最常出現的城市 (排除 NULL)
        cur.execute("""
            SELECT d.city_name 
            FROM itinerary_items ii
            JOIN destinations d ON ii.destination_id = d.id
            WHERE ii.trip_id = %s AND d.city_name IS NOT NULL
            GROUP BY d.city_name
            ORDER BY COUNT(d.city_name) DESC
            LIMIT 1;
        """, (trip_id,))
        
        row = cur.fetchone()
        
        # 如果這個行程根本沒有加入任何有 city_name 的景點，就保留預設圖，直接結束
        if not row:
            return 

        target_city = row["city_name"]

        # 2. 呼叫 DuckDuckGo 圖片搜尋 API
        image_urls = fetch_city_image_from_ddg(f"{target_city} 旅遊知名地標")

        if image_urls and len(image_urls) > 0:
            # 將 List 轉成標準 JSON 字串 (例如：'["url1", "url2", "url3"]')
            cover_data_json = json.dumps(image_urls)

            # 3. 如果成功拿到圖片，更新資料庫的 cover_url
            cur.execute("""
                UPDATE trips 
                SET cover_url = %s 
                WHERE id = %s
            """, (cover_data_json, trip_id))
            conn.commit()
            print(f"✅ 行程 {trip_id} 封面已在背景成功更新為 {target_city} 的照片！")
        else:
            print(f"⚠️ 行程 {trip_id} 無法找到合適的圖片，保留預設封面。")

    except Exception as e:
        print(f"❌ 背景更新行程封面失敗: {e}")
    finally:
        # 確保最後一定要關閉連線，避免佔用連線池
        cur.close()
        conn.close()



def fetch_city_image_from_ddg(target):
    total_result = []
    # 設定retry，避免抓圖失敗
    max_retries = 3
    retry_delay = 1

    for i in range(max_retries):
        
        # 使用 context manager 自動處理連線
        with DDGS() as ddgs:
            # ---------------------------------------------------------
            # 2. 搜尋圖片 (加入版權過濾)
            # ---------------------------------------------------------
            try:
                # 加入 license 參數
                # license='Public' -> 公眾領域 (最安全，像 CC0)
                # license='Share'  -> 允許分享 (通常需要標示出處)
                # license='Modify' -> 允許修改
                
                images_results = list(ddgs.images(
                    target, 
                    max_results=3, 
                    safesearch='on',
                    license='Public'  # <--- 關鍵修改在這裡！
                ))
                if images_results:
                    for img in images_results:
                        total_result.append(img.get("image"))
                    break # 找到圖片，換下一個景點
                else:
                    raise Exception("找不到圖片")
                    
            except Exception as e:
                print(f"   ⚠️ 第 {i + 1} 次嘗抓取取圖片失敗 ({target}): {e}")
                if i < max_retries - 1:
                    # 指數退避 + 隨機抖動，避免被伺服器偵測為機器人
                    sleep_time = (retry_delay * 2 ** i) + random.uniform(0, 1)
                    time.sleep(sleep_time)
                else:
                    print(f"❌ {target}圖片搜尋錯誤: {e}")
    
        # # 景點之間稍微停頓，避免被封鎖，之後有需要再開啟
        # time.sleep(0.5)

    return total_result