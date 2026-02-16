import os
from google import genai
from google.genai import types
from google.genai.types import Tool, GenerateContentConfig
from dotenv import load_dotenv
load_dotenv()
import json
from ddgs import DDGS
from services.db_service import *
import re
import json
import time, random


def get_travel_blog_urls(location):
    # 🔍 Debug: 先印出來看看，確定真的有傳對關鍵字進去
    target = f"{location} 旅遊遊記 必去景點"
    print(f"🕵️ 正在向 DuckDuckGo 查詢關鍵字：[{target}]") 
    urls = []
    excluded_domains = ["googleusercontent.com", "facebook.com", "youtube.com", "591.com", "shopee", "wikipedia"]
    travel_keywords = ["遊記", "景點", "推薦", "行程", "攻略", "懶人包", "打卡"]
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
                max_results=10
            )
            for r in ddgs_gen:
                href = r['href'].lower()
                title = r['title']
                body = r['body']
                print(f"{r['href']}\n\n{title}\n\n{body}\n\n")

                # 移除標題與摘要中的所有空白（包括全形、半形、換行）
                clean_title = re.sub(r'\s+', '', title)
                clean_body = re.sub(r'\s+', '', body)
                
                # 過濾搜尋結果
                is_valid_url = not any(domain in href for domain in excluded_domains)
                is_relevant = any(key in clean_title or key in clean_body for key in travel_keywords)
                correct_location = (location in clean_title) or (location in clean_body)
                
                if is_valid_url and is_relevant and correct_location:
                    urls.append(r['href'])
    except Exception as e:
        print(f"⚠️ 搜尋發生錯誤: {e}")
    
    if not urls:
        print("❌ 警告：搜尋結果為空！請檢查關鍵字是否正確。")
        raise HTTPException(status_code=500, detail="沒有符合要求的網址")
    print(f"總共搜尋{len(ddgs_gen)}筆結果，有{len(urls)}筆符合要求")
    print(urls[:3])
    return urls[:3]


def extract_spots_from_urls(urls, location):
    url0 = urls[0]
    url1 = urls[1]
    url2 = urls[2]

    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    model_id = "gemini-2.5-flash"
    # model_id = "gemini-3-flash-preview"

    tools = [
    {"url_context": {}},
    ]

    prompt = f"""
        請閱讀並分析以下網址內容：
        {url0}, {url1}, {url2}

        # 任務
        1. 提取所有關於「{location}」的旅遊景點。
        2. **去重處理**：相同景點僅保留一個。
        3. **描述生成**：參考網頁中的介紹，為每個景點撰寫一段 40 字左右、生動且具吸引力的描述。
        
        # 請回傳一個 JSON 格式的列表，每個元素包含以下欄位：
        - "city": 景點所在的具體行政城市/縣名稱 (字串，請從網頁內容分析得出)
        - "attraction": 景點名稱 (字串)
        - "description": 景點描述 (字串)
        - "geo_tags": 從大到小的地理標籤字串，用逗號隔開 (例如：國家,州/省,城市)

        範例 (僅供格式參考，請根據實際搜尋內容調整)：
        [
            {{"city": "具體城市A", "attraction": "景點 A", "description": "描述 A...", "geo_tags": "國家,區域,具體城市A"}},
            {{"city": "具體城市B", "attraction": "景點 B", "description": "描述 B...", "geo_tags": "國家,區域,具體城市B"}}
        ]

        # 規則
        1. 直接以 [ 開頭，並以 ] 結尾。
        2. 不要使用 Markdown 的程式碼區塊標籤（如 ```json）。
        3. 如果所有網址都失效，請回傳空陣列 []。

    """
    try:
        print("--------------------Gemini準備開始跑--------------------------")
        response = client.models.generate_content(
            model=model_id,
            contents=prompt,
            config=GenerateContentConfig(
                tools=tools,
            )
        )

        for part in reversed(response.candidates[0].content.parts):
            print(part)
            if not part.text:
                continue
            
            raw_data = part.text
        
            print(raw_data)
            print("-----------------------成功啦！！！-------------------------------")
            # [[\s\S]*] 代表從第一個 [ 匹配到最後一個 ]，包含換行
            match = re.search(r'\[[\s\S]*\]', raw_data)

            if match:
                json_content = match.group(0)
                json_content = json_content.replace('```json', '').replace('```', '')
                data = json.loads(json_content)
            else:
                # 如果沒抓到標籤，就嘗試直接解析
                data = json.loads(raw_data)
            print(f"總共有 {len(data)} 筆景點")
            return data
        
        return []
    except json.JSONDecodeError as e:
        print(f"❌ JSON 解析失敗，Gemini 回傳格式不正確: {e}")
        raise HTTPException(status_code=500, detail=f"JSON 解析失敗，Gemini 回傳格式不正確")
    except Exception as e:
        print(f"🚨 Gemini發生非預期錯誤: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Gemini發生未預期錯誤，請重試")
    
def fetch_attraction_images(ai_gen_data):
    total_result = []
    attractions = [item.get('attraction')for item in ai_gen_data]
    
    for attraction in attractions:
        # 初始化結果字典
        attraction_data = {
            "name": attraction,
            "images": [],
        }

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
                        attraction, 
                        max_results=3, 
                        safesearch='on',
                        license='Public'  # <--- 關鍵修改在這裡！
                    ))
                    if images_results:
                        for img in images_results:
                            attraction_data["images"].append({
                                "url": img.get("image"),
                                "source": img.get("url") # 最好保留原始網頁連結，以備不時之需
                            })
                        break # 找到圖片，換下一個景點
                    else:
                        raise Exception("找不到圖片")
                        
                except Exception as e:
                    print(f"   ⚠️ 第 {i + 1} 次嘗抓取取圖片失敗 ({attraction}): {e}")
                    if i < max_retries:
                        # 指數退避 + 隨機抖動，避免被伺服器偵測為機器人
                        sleep_time = (retry_delay * 2 ** i) + random.uniform(0, 1)
                        time.sleep(sleep_time)
                    else:
                        print(f"❌ {attraction}圖片搜尋錯誤: {e}")

        total_result.append(attraction_data)
        
        # # 景點之間稍微停頓，避免被封鎖，之後有需要再開啟
        # time.sleep(0.5)

    return total_result

def integrate_spot_results(location, ai_gen_data, img_data):
    # 將 img_data 轉換成以名稱為 Key 的字典，方便查找
    # 格式：{'日清杯麵博物館': [{'url':...}, {...}], ...}
    img_dict = {item['name']: item['images'] for item in img_data}

    result = []

    for item in ai_gen_data:
        attraction_name = item.get('attraction')
        images = img_dict.get(attraction_name, [])
        

        data = {
            'input_region': location,
            'city': item.get('city'),
            'attraction': item.get('attraction'),
            'description': item.get('description'),
            'geo_tags': item.get('geo_tags'),
            'images': images
        }
        result.append(data)


    return result



def run_web_scraping_workflow(location):
    urls = get_travel_blog_urls(location)
    print("4")
    ai_gen_data = extract_spots_from_urls(urls, location)
    print("5")
    img_data = fetch_attraction_images(ai_gen_data)
    print("6")
    result = integrate_spot_results(location, ai_gen_data, img_data)

    return result

