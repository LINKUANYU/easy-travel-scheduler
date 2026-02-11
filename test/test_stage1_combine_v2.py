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
    print("---------------------")

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
        
        # 輸出格式 (嚴格要求)
        [["{location}", "景點名稱", "描述內容"], ["{location}", "景點名稱", "描述內容"]]

    """

    response = client.models.generate_content(
        model=model_id,
        contents=prompt,
        config=GenerateContentConfig(
            tools=tools,
        )
    )
    print("---------result-----------")
    ai_response = response.candidates[0].content.parts[0].text
    print(ai_response)
    print("--------------------------")

    return ai_response


def extract_json_data(ai_response):
    # 使用正則表達式尋找 [ ... ] 格式的內容
    # re.DOTALL 確保可以匹配多行文字
    match = re.search(r'\[.*\]', ai_response, re.DOTALL)
    
    if match:
        json_str = match.group(0)
        try:
            # 轉換成 Python 的 List
            data_list = json.loads(json_str)
            return data_list
        except json.JSONDecodeError as e:
            print(f"JSON 解析失敗: {e}")
    return None

# r'\[.*\]'：
# \[：叫程式去找左中括號 [。因為 [ 在正則表達式中有特殊意義，所以前面要加一個反斜線 \ 告訴它「我要找的就是這個符號」。
# .*：. 代表「任何字元」，* 代表「不限數量」。組合起來就是「中間管它寫什麼都給我包進來」。
# \]：叫程式去找右中括號 ]。
# re.DOTALL：
# 預設情況下，正則表達式看到「換行」就會停住。
# 加上這個設定後，它會無視換行，把整個多行的 JSON 區塊當成一個長長的字串。
# 想像一下： 它就像是在雜亂的房間裡（AI 的回覆），找到一個大箱子（以 [ 開始、以 ] 結束的地方）。

def search_attraction_imgs(ai_gen_data):
    attractions = [item[1] for item in ai_gen_data]
    
    total_result = []
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

def format_img_data(attractions_img_data):





def write_into_db(ai_gen_data):
    # 因測試用沒有用Fastapi所以先不用Depends
    conn = POOL.connection()

    try:
        cur = conn.cursor()
        sql = "INSERT INTO destinations(city_name, place_name, description) VALUES(%s, %s, %s)"
        cur.executemany(sql, ai_gen_data)
        
        conn.commit()
        print(f"✅ 成功寫入 {len(ai_gen_data)} 筆資料到本地 MySQL")
    except pymysql.MySQLError as e:
        conn.rollback() 
        print(f"Database error: {e}")
        raise HTTPException(status_code=500, detail="Database insertion failed")
    finally:
        conn.close()
        cur.close()



# location = "大阪"
# urls = search_with_duckduckgo(f"{location} 旅遊遊記 必去景點")
# ai_response = parse_attractions_from_url(urls, location)
# ai_gen_data = extract_json_data(ai_response)
ai_gen_data = [
    ["台北", "台北 101", "台灣地標建築"],
    ["台北", "九份老街", "充滿懷舊風情的山城"]
]
search_attraction_imgs(ai_gen_data)
# write_into_db(ai_gen_data)


