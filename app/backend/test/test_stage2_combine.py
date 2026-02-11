import os
import json
import time
from google import genai
from google.genai import types
from ddgs import DDGS
from dotenv import load_dotenv

load_dotenv()

# --- 第一部分：使用 Gemini 生成描述 ---
def fetch_descriptions(attraction_json):
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    
    location = attraction_json.get("location", "未知地點")
    # 只取景點名稱，節省 Token
    names = [a['name'] for a in attraction_json.get("attractions", [])]
    names_str = ", ".join(names)

    prompt = f"地點：{location}\n景點名單：{names_str}\n任務：請為名單中的每個景點寫一段 50 字以內的旅遊介紹。口吻活潑，像旅遊雜誌，並提到最大亮點。"

    generate_content_config = types.GenerateContentConfig(
        system_instruction="你是一位專業旅遊編輯。請嚴格以 JSON 格式回傳，格式為 {'attractions': [{'name': '...', 'description': '...'}]}",
        response_mime_type="application/json",
        temperature=0.2, # 降低隨機性
    )

    print(f"🚀 正在為 {len(names)} 個景點生成 AI 文案...")
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=generate_content_config,
    )

    try:
        enhanced_data = json.loads(response.text)
        desc_map = {item['name']: item['description'] for item in enhanced_data['attractions']}
        for attr in attraction_json['attractions']:
            attr['description'] = desc_map.get(attr['name'], "暫無描述")
        return attraction_json
    except:
        return attraction_json

# --- 第二部分：使用 DuckDuckGo 抓取圖片網址 ---
def fetch_image_urls(attraction_json):
    location = attraction_json.get("location", "")
    print("📸 正在抓取景點圖片網址...")
    
    with DDGS() as ddgs:
        for attr in attraction_json['attractions']:
            query = f"{location} {attr['name']} 旅遊"
            try:
                # 抓取第一張圖片
                img_results = ddgs.images(query, max_results=1, safesearch='strict')
                if img_results:
                    attr['image_url'] = img_results[0]['image']
                    print(f"   -> {attr['name']}: 已找到圖片")
                else:
                    attr['image_url'] = ""
                
                # 稍微休息避免被 DDG 封鎖
                time.sleep(0.5) 
            except Exception as e:
                print(f"   -> {attr['name']}: 抓取失敗 ({e})")
                attr['image_url'] = ""
                
    return attraction_json

# --- 測試執行流程 ---
if __name__ == "__main__":
    # 這是你從上一階段得到的 JSON
    input_data = {
        "location": "東京",
        "attractions": [
            {"name": "淺草寺"},
            {"name": "東京鐵塔"},
            {"name": "吉卜力美術館"}
        ]
    }

    # 1. 補完文案 (Call Gemini)
    data_with_desc = fetch_descriptions(input_data)
    
    # 2. 補完圖片 (Call DuckDuckGo)
    final_data = fetch_image_urls(data_with_desc)

    # 3. 儲存成最終 JSON
    with open("final_trip_data.json", "w", encoding="utf-8") as f:
        json.dump(final_data, f, ensure_ascii=False, indent=4)
        
    print("\n🎉 所有資料補完完畢！請查看 final_trip_data.json")