import os
import json
import ast
import time
from google import genai
from google.genai import types
from dotenv import load_dotenv
from ddgs import DDGS 

# ---------------------------------------------------------
# ⏱️ 計時器小工具
# ---------------------------------------------------------
class Timer:
    def __init__(self, name):
        self.name = name
        self.start_time = None

    def start(self):
        self.start_time = time.time()
        print(f"⏱️ [{self.name}] 開始執行...")

    def stop(self):
        elapsed = time.time() - self.start_time
        print(f"✅ [{self.name}] 完成！耗時: {elapsed:.2f} 秒")
        return elapsed

# ---------------------------------------------------------
# 1. 環境設定
# ---------------------------------------------------------
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

if not api_key:
    print("❌ 錯誤：找不到 GEMINI_API_KEY")
    exit()

client = genai.Client(api_key=api_key)

# ---------------------------------------------------------
# 2. 搜尋函式 (DuckDuckGo)
# ---------------------------------------------------------
def search_with_duckduckgo(query):
    search_timer = Timer("DuckDuckGo 搜尋")
    search_timer.start()
    
    print(f"   🔎 正在搜尋關鍵字: {query}")
    results = []
    try:
        with DDGS() as ddgs:
            # max_results=5 抓取 5 筆資料
            ddgs_gen = ddgs.text(
                query, 
                region='tw-tz', 
                safesearch='strict', 
                timelimit='y',
                max_results=5 
            )
            for r in ddgs_gen:
                results.append(f"標題: {r['title']}\n網址: {r['href']}\n摘要: {r['body']}")
    except Exception as e:
        print(f"⚠️ 搜尋發生錯誤: {e}")
    
    search_timer.stop()
    return "\n\n".join(results)

# ---------------------------------------------------------
# 3. 主程式邏輯
# ---------------------------------------------------------
if __name__ == "__main__":
    total_timer = Timer("整個程式流程")
    total_timer.start()

    target_location = "福岡" 
    
    # --- 步驟 A: 搜尋 ---
    raw_data = search_with_duckduckgo(f"{target_location} 旅遊遊記 必去景點")

    if not raw_data:
        print("❌ 搜尋失敗，無資料。")
        exit()

    # --- 步驟 B: 準備提示詞 ---
    prompt = f"""
    參考資料：
    {raw_data}

    請將上述資料整理成 JSON 格式。
    
    ⚠️ 嚴格規則：
    1. 必須使用標準 JSON 格式。
    2. 為了節省空間，請不要自行添加「景點描述」，只要「景點名稱」即可。
    3. 格式範例：
    {{
      "location": "{target_location}",
      "spots": ["景點A", "景點B", "景點C"],
      "blog_references": [
        {{"title": "文章標題", "url": "http://example.com"}}
      ]
    }}
    """

    # --- 步驟 C: 呼叫 Gemini ---
    ai_timer = Timer("Gemini 思考與整理")
    ai_timer.start()

    # 🔧 修改點 1: 加大 max_output_tokens 到 2048，防止話沒講完被切斷
    config = types.GenerateContentConfig(
        temperature=0.1, 
        max_output_tokens=2048, 
        response_mime_type="application/json"
    )

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash', 
            contents=prompt,
            config=config
        )
        ai_timer.stop()

        # 🔧 修改點 2: 檢查是否因為長度限制被切斷 (Finish Reason)
        # 雖然新版 SDK 屬性可能不同，但我們可以先解析文字看看
        raw_text = response.text.strip()
        
        # 去除 markdown
        if raw_text.startswith("```json"): raw_text = raw_text[7:-3]
        if raw_text.startswith("```"): raw_text = raw_text[3:-3]
        
        # --- 步驟 D: 資料解析 ---
        print("🔧 正在解析資料...")
        data = None
        try:
            data = json.loads(raw_text)
        except json.JSONDecodeError:
            print("⚠️ 標準 JSON 解析失敗，正在檢查是否字串不完整...")
            # 簡單檢查結尾是否完整
            if not raw_text.endswith("}"):
                print("❌ 嚴重錯誤：JSON 字串被切斷了 (Truncated)！")
                print("原因：max_output_tokens 設定太小，或資料量太大。")
                print(f"收到的殘缺內容 (後100字): ...{raw_text[-100:]}")
                exit() # 直接結束，不要硬解
            
            print("啟用 AST 解析救援模式...")
            try:
                data = ast.literal_eval(raw_text)
            except Exception as e:
                print(f"❌ 解析失敗，原始內容:\n{raw_text}")
                raise e

        # --- 步驟 E: 存檔 ---
        with open("final_trip_data.json", "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=4)

        print("\n" + "="*40)
        print("🎉 成功！成果展示：")
        print("="*40)
        print(f"📍 地點：{data.get('location')}")
        print(f"🏞️ 景點：{data.get('spots')}")
        print("="*40)
        
        total_timer.stop()

    except Exception as e:
        print(f"\n❌ 程式執行發生錯誤：{e}")