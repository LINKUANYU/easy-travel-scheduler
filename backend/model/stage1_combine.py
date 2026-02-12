# To run this code you need to install the following dependencies:
# pip install google-genai

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


def search_with_duckduckgo(location):
    # 🔍 Debug: 先印出來看看，確定真的有傳對關鍵字進去
    print(f"🕵️ 正在向 DuckDuckGo 查詢關鍵字：[{location}]") 
    
    results = []
    urls = []
    try:
        with DDGS() as ddgs:
            # ==========================================
            # 🛡️ 加入 safesearch='strict' (嚴格過濾成人/垃圾內容)
            # 🛡️ 確認 region='tw-tz' (鎖定台灣繁體中文結果)
            # ==========================================
            ddgs_gen = ddgs.text(
                location, 
                region='tw-tz', 
                safesearch='strict', # <--- 關鍵修改：強制開啟安全搜尋
                timelimit='y',       # <--- 建議加入：只找 'y' (過去一年) 的資料
                max_results=3
            )
            
            for r in ddgs_gen:
                # results.append(f"標題: {r['title']}\n網址: {r['href']}\n摘要: {r['body']}")
                urls.append(r['href'])
    except Exception as e:
        print(f"⚠️ 搜尋發生錯誤: {e}")
    
    if not urls:
        print("❌ 警告：搜尋結果為空！請檢查關鍵字是否正確。")
        
    # results = "\n\n".join(results)
    # print(results)
    # urls = "\n".join(urls)
    print("----------url--------")
    print(urls)

    return urls



def parse_attractions_from_url(urls, location):
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
        

location = "首爾"
urls = search_with_duckduckgo(f"{location} 旅遊遊記 必去景點")
ai_gen_data = parse_attractions_from_url(urls, location)
img_data = search_attraction_imgs(ai_gen_data)
combine_data = combine_data(ai_gen_data, img_data)
write_into_db(combine_data)



# ai_gen_data = [
#   {
#     "city": "大阪",
#     "attraction": "日清杯麵博物館 大阪池田",
#     "description": "走進充滿創意的泡麵世界，除了了解歷史，還能親自彩繪杯身、挑選配料，製作出獨一無二的專屬杯麵，是極具趣味的DIY體驗。"
#   },
#   {
#     "city": "大阪",
#     "attraction": "LaLaport 門真 / 三井 Outlet Park",
#     "description": "結合了 Outlet 與購物中心的全新地標，集合眾多知名品牌與黑門市場美食。寬敞好逛的空間能一次購足所需，是大阪近期血拚勝地。"
#   }
# ]

# img_data = [
#     {
#         'name': '日清杯麵博物館 大阪池田', 
#         'images': 
#             [
#                 {'url': 'https://res-4.cloudinary.com/jnto/image/upload/w_2064,h_1300,c_fill,f_auto,fl_lossy,q_auto/v1645167602/osaka/M_00142_001', 'source': 'https://www.japan.travel/hk/spot/1081/'},
#                 {'url': 'https://osaka-info.jp/spot/images/47fed0c6d01ddcfaf69c71c4f53d68eb5530e614.jpg', 'source': 'https://cn.osaka-info.jp/spot/gastronomy-cupnoodle/'}, 
#                 {'url': 'https://www.kiri-san.com/wp-content/uploads/2018/12/池田駅_8244.jpg', 'source': 'https://www.kiri-san.com/post/25228'}
#             ]
#     }, 
#     {
#         'name': 'LaLaport 門真 / 三井 Outlet Park', 
#         'images': 
#         [
#             {'url': 'https://assets.funliday.com/posts/wp-content/uploads/2023/07/18120401/ららぽーと大阪門真.jpg', 'source': 'https://www.funliday.com/posts/japan-info-shopping-osaka-outlet-kodoma/'}, 
#             {'url': 'https://i.ytimg.com/vi/__iYy0ejuf0/maxresdefault.jpg', 'source': 'https://www.youtube.com/watch?v=__iYy0ejuf0'}, 
#             {'url': 'https://carlming.net/wp-content/uploads/2024/04/20231013-20231013_170120.jpg', 'source': 'https://carlming.net/57622'}
#         ]
#     }
# ]



# def extract_json_data(ai_response):
#     # 使用正則表達式尋找 [ ... ] 格式的內容
#     # re.DOTALL 確保可以匹配多行文字
#     match = re.search(r'\[.*\]', ai_response, re.DOTALL)
    
#     if match:
#         json_str = match.group(0)
#         try:
#             # 轉換成 Python 的 List
#             data_list = json.loads(json_str)
#             return data_list
#         except json.JSONDecodeError as e:
#             print(f"JSON 解析失敗: {e}")
#     return None

# r'\[.*\]'：
# \[：叫程式去找左中括號 [。因為 [ 在正則表達式中有特殊意義，所以前面要加一個反斜線 \ 告訴它「我要找的就是這個符號」。
# .*：. 代表「任何字元」，* 代表「不限數量」。組合起來就是「中間管它寫什麼都給我包進來」。
# \]：叫程式去找右中括號 ]。
# re.DOTALL：
# 預設情況下，正則表達式看到「換行」就會停住。
# 加上這個設定後，它會無視換行，把整個多行的 JSON 區塊當成一個長長的字串。
# 想像一下： 它就像是在雜亂的房間裡（AI 的回覆），找到一個大箱子（以 [ 開始、以 ] 結束的地方）。