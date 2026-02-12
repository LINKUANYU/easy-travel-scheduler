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


def search_spot_url(location):
    # 🔍 Debug: 先印出來看看，確定真的有傳對關鍵字進去
    target = f"{location} 旅遊遊記 必去景點"
    print(f"🕵️ 正在向 DuckDuckGo 查詢關鍵字：[{target}]") 
    urls = []
    try:
        with DDGS() as ddgs:
            # ==========================================
            # 🛡️ 加入 safesearch='strict' (嚴格過濾成人/垃圾內容)
            # 🛡️ 確認 region='tw-tz' (鎖定台灣繁體中文結果)
            # ==========================================
            ddgs_gen = ddgs.text(
                target, 
                region='tw-tz', 
                safesearch='strict', # <--- 關鍵修改：強制開啟安全搜尋
                timelimit='y',       # <--- 建議加入：只找 'y' (過去一年) 的資料
                max_results=3
            )
            
            for r in ddgs_gen:
                urls.append(r['href'])
    except Exception as e:
        print(f"⚠️ 搜尋發生錯誤: {e}")
    
    if not urls:
        print("❌ 警告：搜尋結果為空！請檢查關鍵字是否正確。")

    return urls



def parse_spot_url(urls, location):
    url0 = urls[0]
    url1 = urls[1]
    url2 = urls[2]

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    model_id = "gemini-3-flash-preview"

    tools = [
    {"url_context": {}},
    ]

    prompt = f"""
        請閱讀並分析以下網址內容：
        {url0}, {url1}, {url2}

        # 任務
        1. 提取所有關於「{location}」的旅遊景點。
        2. **去重處理**：相同景點僅保留一個。
        3. **描述生成**：參考網頁中的介紹，為每個景點撰寫一段 40 字到 50字、生動且具吸引力的描述。
        
        # 輸出格式 (嚴格要求使用 JSON)
        請回傳一個 JSON 格式的列表，每個元素包含以下欄位：
        - "city": 城市名稱 (字串，例如："{location}")
        - "attraction": 景點名稱 (字串)
        - "description": 景點描述 (字串)

        範例：
        [
            {{"city": "{location}", "attraction": "景點 A", "description": "描述 A..."}},
            {{"city": "{location}", "attraction": "景點 B", "description": "描述 B..."}}
        ]

    """

    response = client.models.generate_content(
        model=model_id,
        contents=prompt,
        config=GenerateContentConfig(
            tools=tools,
        )
    )

    raw_data = response.candidates[0].content.parts[0].text
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw_data)

    if match:
        json_content = match.group(1)
        data = json.loads(json_content)
    else:
        # 如果沒抓到標籤，就嘗試直接解析
        data = json.loads(raw_data)
    
    return data

def search_attraction_imgs(ai_gen_data):
    total_result = []
    attractions = [item.get('attraction')for item in ai_gen_data]
    
    for attraction in attractions:
        # 初始化結果字典
        attraction_data = {
            "name": attraction,
            "images": [],
        }

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
                    attraction, 
                    max_results=3, 
                    safesearch='on',
                    license='Public'  # <--- 關鍵修改在這裡！
                ))
                
                for img in images_results:
                    attraction_data["images"].append({
                        "url": img.get("image"),
                        "source": img.get("url") # 最好保留原始網頁連結，以備不時之需
                    })
                    
            except Exception as e:
                print(f"   ❌ 圖片搜尋錯誤: {e}")

        total_result.append(attraction_data)

    return total_result

def combine_data(ai_gen_data, img_data):
    # 將 img_data 轉換成以名稱為 Key 的字典，方便查找
    # 格式：{'日清杯麵博物館': [{'url':...}, {...}], ...}
    img_dict = {item['name']: item['images'] for item in img_data}

    combine_data = []

    for item in ai_gen_data:
        attraction_name = item.get('attraction')
        images = img_dict.get(attraction_name, [])
        

        data = {
            'city': item.get('city'),
            'attraction': item.get('attraction'),
            'description': item.get('description'),
            'images': images
        }
        combine_data.append(data)


    return combine_data


def write_into_db(combine_data):
    # 因測試用沒有用Fastapi所以先不用Depends
    conn = POOL.connection()

    try:
        # 開啟事務 (有些連線池預設會幫你做，但手動更保險)
        cur = conn.cursor()

        for item in combine_data:
            # 插入單個景點的資訊
            dest_sql = "INSERT INTO destinations(city_name, place_name, description) VALUES(%s, %s, %s)"
            cur.execute(dest_sql, (item.get('city'), item.get('attraction'), item.get('description')))
            
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
        



