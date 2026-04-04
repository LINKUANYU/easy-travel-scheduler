import os
from google import genai
from google.genai import types
from google.genai.types import Tool, GenerateContentConfig
from dotenv import load_dotenv
load_dotenv()
import json
from ddgs import DDGS
from core.database import *
import re
import json
import time, random
import urllib.parse

# ==========================================
# 模組 1：嚴格的網址守門員 (DuckDuckGo)
# ==========================================
def get_high_quality_blog_url(location):
    # 🔍 Debug: 先印出來看看，確定真的有傳對關鍵字進去
    target = f"{location} 旅遊 遊記 必去 景點 懶人包"
    # target = f"{location} 旅遊遊記 必去景點"
    print(f"🕵️ 正在向 DuckDuckGo 查詢關鍵字：[{target}]") 
    
    excluded_domains = [
        "google", "facebook", "youtube", "591", "shopee", "wikipedia", "dcard", "ptt.cc", "mobile01",
        "klook", "kkday", "agoda", "booking", "tripadvisor", "ezTravel", "liontravel",
        "yahoo", "ettoday", "ltn", "udn", "chinatimes"
    ]
    travel_keywords = ["遊記", "景點", "推薦", "行程", "攻略", "懶人包", "打卡", "一日遊"]
    negative_keywords = ["新聞", "徵才", "職缺", "租屋", "售票", "天氣", "旅行社", "維基百科"]
    
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
                max_results=15
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
                # 閘門 1: 網域黑名單
                if any(domain in href for domain in excluded_domains): continue
                # 閘門 2: 標題必須包含目的地 (非常重要！)
                if location not in clean_title: continue
                # 閘門 3: 排除負面關鍵字
                if any(neg in clean_title or neg in clean_body for neg in negative_keywords): continue
                # 閘門 4: 必須包含旅遊特徵字
                if not any(key in clean_title or key in clean_body for key in travel_keywords): continue
                
                # 嘗試將中文網址進行 URL Encoding (解決致命原因 B)
                # 只對 path 的部分編碼，保留 https://
                parsed_url = urllib.parse.urlparse(href)
                encoded_path = urllib.parse.quote(parsed_url.path)
                safe_url = urllib.parse.urlunparse((parsed_url.scheme, parsed_url.netloc, encoded_path, parsed_url.params, parsed_url.query, parsed_url.fragment))


                print(f"🎯 鎖定高品質網址: {r['title']} \n({safe_url})")
                # 只要找到「一個」最完美的網址就回傳，降低 API 負擔
                return safe_url
    except Exception as e:
        print(f"⚠️ duckduckgo搜尋發生錯誤: {e}")
    
    return None

# ==========================================
#  模組 2：引擎 A - Gemini 原生 url_context
# ==========================================
def run_gemini_url_context(url, location, client, prompt_template):
    print("   [引擎 A] 啟動 Gemini 原生 url_context 解析...")
    prompt = prompt_template.format(location=location, content=f"請解析此網址：{url}")
    model_id = "gemini-3-flash-preview"
    tools = [{"url_context": {}},]
    max_attempts = 2

    for attempt in range(1, max_attempts + 1):
        try:
            print("--------------------Gemini url_context準備開始跑--------------------------")
            start_time = time.time()
            response = client.models.generate_content(
                model=model_id,
                contents=prompt,
                config=GenerateContentConfig(
                    tools=tools,
                )
            )


            for part in reversed(response.candidates[0].content.parts):
                # print(part)
                if not part.text:
                    continue
                
                raw_data = part.text
            
                # print(raw_data)

                # [[\s\S]*] 代表從第一個 [ 匹配到最後一個 ]，包含換行
                match = re.search(r'\[[\s\S]*\]', raw_data)

                if match:
                    json_content = match.group(0)
                    json_content = json_content.replace('```json', '').replace('```', '')
                    data = json.loads(json_content)
                else:
                    # 如果沒抓到標籤，就嘗試直接解析
                    data = json.loads(raw_data)

                if len(data) < 3:
                    print("❌ 警告：Gemini搜尋結果小於三筆！請檢查關鍵字是否正確。")
                    raise ValueError("url_context 解析失敗或景點數量不足")

                elapsed_time = time.time() - start_time
                print(f"✅ 成功！耗時 {elapsed_time:.2f} 秒")
                print(f"🎉 解析成功！共找到 {len(data)} 個景點。")
                return data
            
            raise ValueError("Gemini 未回傳有效內容")
        
        except Exception as e:
            print(f"🚨 第 {attempt} 次 Gemini 發生錯誤: {type(e).__name__}: {e}")

            if attempt < max_attempts:
                print("⏳ 休息 10 秒後準備進行重試...")
                time.sleep(10)
                continue
            else:
                print("❌ [引擎 A] 重試次數已達上限，徹底失敗。")
                raise e

    
# ==========================================
# 模組 3：引擎 B - Jina 備援解析器 (含文本清洗)
# ==========================================
def clean_and_slice_text(raw_text):
    # 1. 移除圖片與超連結，只保留文字 (你上一版已經有的)
    text = re.sub(r'!\[([^\]]*)\]\([^)]+\)', '', raw_text)
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    
    
    # 防線一：抹殺「導覽列 (Mega Menu)」雜訊
    lines = text.split('\n')
    valid_lines = []
    for line in lines:
        stripped = line.strip()
        # 關鍵邏輯：如果是清單 (* 或 - 開頭)，而且字數「小於 20 字」
        # 這 99% 是導覽列的選單項目 (例如 "* 香港旅遊")，我們直接刪除它！
        if (stripped.startswith('*') or stripped.startswith('-')) and len(stripped) < 20:
            continue
        valid_lines.append(line)
    
    # 將剩下的有效行重新組裝
    text = '\n'.join(valid_lines)
    
    # 壓縮多餘的換行
    text = re.sub(r'\n\s*\n', '\n', text)
    
    # 防線二：尋找「文章重心」
    # 旅遊部落格的正文，通常會從第一個 H2 (##) 或 H3 (###) 標題開始
    # 我們讓程式自己去找第一個大標題在哪裡，而不是傻傻從第 0 字開始讀
    match = re.search(r'\n##+ ', text)
    if match:
        # 找到第一個 ## 的位置！為了保留一點部落客的「前言」，我們把起點往前推 300 字
        start_idx = max(0, match.start() - 300)
        # 從重心開始，往後切 8000 字 (約耗費 10K Tokens，完美符合你的限制)
        final_text = text[start_idx : start_idx + 8000]
        print("找到文章重心<H2>開頭")
    else:
        # 萬一這篇沒用 H2 標題，就直接取最前面的 8000 字
        final_text = text[:8000]
        print("沒找到<H2>開頭，直接用前8000個字")
        
    return final_text

    

def run_jina_fallback(url, location, client, prompt_template):
    print("   [引擎 B] 啟動 Jina Reader 備援解析...")
    
    model_id = "gemini-3-flash-preview"
    
    jina_url = f"https://r.jina.ai/{url}"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        # Jina 允許你加上這個 header 讓它回傳更乾淨的內容
        "X-Return-Format": "markdown" 
    }
    try:
        res = requests.get(jina_url, headers=headers, timeout=(5, 60)) # 5秒連線超時，45秒讀取超時
        if res.status_code != 200:
            print(f"❌ Jina 抓取失敗，狀態碼: {res.status_code}")
            raise ValueError(f"Jina API 錯誤 ({res.status_code})")
        
        clean_text = clean_and_slice_text(res.text)

    except requests.exceptions.Timeout:
        print("❌ Jina 抓取超時！目標網頁回應過慢 (超過設定時間)。")
        raise ValueError("Jina Timeout")
    
    except requests.exceptions.RequestException as e:
        print(f"❌ Jina 網路連線錯誤: {e}")
        raise ValueError(f"Jina Request Error: {e}")
    
    start_time = time.time()
    print("🧠 2. 開始將純文字交給 Gemini 分析...")

    prompt = prompt_template.format(location=location, content=f"請分析以下文章內容：\n{clean_text}")

    try:
        response = client.models.generate_content(
            model=model_id,
            contents=prompt,
        )
        
        raw_data = response.text.strip()
        
        if raw_data.startswith('```json'):
            raw_data = raw_data.replace('```json', '').replace('```', '')
            
        data = json.loads(raw_data)
        elapsed_time = time.time() - start_time
        print(f"✅ 成功！耗時 {elapsed_time:.2f} 秒")
        print(f"🎉 解析成功！共找到 {len(data)} 個景點。")
        return data
    except Exception as e:
        print(f"🚨 備援引擎 Gemini 分析發生錯誤: {type(e).__name__}: {e}")
        # 將錯誤往上拋，讓總指揮接手處理 (例如判斷是不是 429)
        raise e


# ==========================================
# 模組 4：雙引擎總指揮中心
# ==========================================
def master_scraper_workflow(location):
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    prompt_template = """
        {content}

        # 任務
        1. 提取所有關於「{location}」的旅遊景點。
        2. **去重處理**：相同景點僅保留一個。
        3. **描述生成**：參考網頁中的介紹，為每個景點撰寫一段 40 字左右、生動且具吸引力的描述。
        4. **實體過濾 (極度重要)**：只提取具有「專有名詞」的明確地標、島嶼、建築。絕對不要提取通用的活動、模糊地點或形容詞（例如：浮潛點、海龜天堂、看夕陽的沙灘、花火節）。
        
        # 請回傳一個 JSON 格式的列表，每個元素包含以下欄位：
        - "city": 景點所在的具體行政城市/縣名稱 (字串)
        - "attraction": 景點名稱 (字串)
        - "description": 景點描述 (字串)
        - "geo_tags": 從大到小的地理標籤字串，用逗號隔開 (例如：國家,州/省,城市)

        範例 (僅供格式參考，請根據實際搜尋內容調整)：
        [
            {{"city": "州/省A", "attraction": "景點 A", "description": "描述 A...", "geo_tags": "國家,州/省,具體城市A"}},
            {{"city": "州/省B", "attraction": "景點 B", "description": "描述 B...", "geo_tags": "國家,州/省,具體城市B"}}
        ]

        # 規則
        1. 直接以 [ 開頭，並以 ] 結尾。
        2. 不要使用 Markdown 的程式碼區塊標籤（如 ```json）。
        3. 如果所有網址都失效，請回傳空陣列 []。

    """

    print(f"\n================ 開始處理 [{location}] ================")
    url = get_high_quality_blog_url(location)

    if not url:
        print(f"❌ 找不到合適 {location} 的網誌，流程終止。")
        raise ValueError(f"找不到「{location}」的相關旅遊資訊，請確認地點名稱是否正確或換個地點試試。")
    
    try:
        # 第一棒：先用原生工具
        result = run_gemini_url_context(url, location, client, prompt_template)
        print("✅ [引擎 A] 成功取得資料！")
        return result
    
    except Exception as e:
        # 攔截 429 額度耗盡錯誤
        error_msg = str(e).lower()
        if "429" in error_msg or "quota" in error_msg or "exhausted" in error_msg:
            print("🚨 嚴重錯誤：Gemini API 額度已耗盡！直接終止任務。")
            # 直接拋出 ValueError，這會跳過下方的備援邏輯，一路傳回 Celery
            raise ValueError("伺服器 AI 服務目前達到流量限制，請稍後再試。")
        
        print(f"⚠️ [引擎 A] 一般性失敗 ({type(e).__name__})，準備切換備援引擎...")

        try:
            # 第二棒：Jina 救援
            time.sleep(5)
            result = run_jina_fallback(url, location, client, prompt_template)
            print("✅ [引擎 B] 成功取得資料！(備援發揮作用)")
            return result
            
        except Exception as fallback_e:
            # 🚨 再次防護：萬一 Jina 執行時才剛好遇到 429
            fallback_msg = str(fallback_e).lower()
            if "429" in fallback_msg or "quota" in fallback_msg or "exhausted" in fallback_msg:
                 raise ValueError("伺服器 AI 服務目前達到流量限制，請稍後再試。")
            if "503" in fallback_msg or "overloaded" in fallback_msg or "unavailable" in fallback_msg:
                 raise ValueError("AI 伺服器目前過載忙碌中，請稍後再試。")
            
            print(f"❌ [雙引擎皆失效]: {fallback_e}")
            return []


# ==========================================
# 主進入點：Celery Worker 呼叫的工作流
# ==========================================
def run_web_scraping_workflow(location):
    ai_gen_data = master_scraper_workflow(location)
    
    # 防呆機制：如果雙引擎都掛了，拋出 ValueError 讓 Celery 標記任務失敗
    if not ai_gen_data:
        raise ValueError(f"無法獲取「{location}」的旅遊資料，請更換地點或稍後再試。")
    
    # 提早呼叫 Google API 進行資料清洗、正名與跨區驗證
    valid_spots = []
    print(f"\n🔍 開始進行 Google Places API 驗證與正名...")

    for item in ai_gen_data:
        original_name = item.get('attraction')

        lat, lng, place_id, address, official_name = get_coordinates(original_name, base_location=location)

        if place_id:
            print(f"{original_name} -> 正名為 {official_name}")
            item["attraction"] = official_name
            item["lat"] = lat
            item["lng"] = lng
            item["address"] = address
            item["google_place_id"] = place_id
            item["input_region"] = location
            valid_spots.append(item)
        else:
            print(f"捨棄無效或跨區地點 {original_name}")
    
    if not valid_spots:
        raise ValueError(f"「{location}」的景點經過 Google 驗證後皆無效，可能為過於空泛的詞彙，請換個地點再試。")
    
    return valid_spots

