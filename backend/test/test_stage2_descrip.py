import os
import json
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

def fetch_descriptions(attraction_json):
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    
    # 提取景點名稱列表
    location = attraction_json.get("location", "未知地點")
    names = [a['name'] for a in attraction_json.get("attractions", [])]
    names_str = ", ".join(names)

    # 建立 Prompt
    prompt = f"""
    我正在開發旅遊網站，請為以下位於「{location}」的景點提供簡短描述：
    名單：{names_str}

    要求：
    1. 每個景點描述限 50 字以內，語氣生動活潑。
    2. 必須包含該景點的「必去理由」或「特色」。
    3. 如果該項是區域（如：新宿），請描述其整體旅遊氛圍。
    """

    # 設定輸出為 JSON 格式
    generate_content_config = types.GenerateContentConfig(
        system_instruction="你是一位專業旅遊編輯。請嚴格以 JSON 格式回傳，格式為 {'attractions': [{'name': '...', 'description': '...'}]}",
        response_mime_type="application/json",
        temperature=0.2, # 調低溫度讓描述更精準不胡扯
    )

    print(f"🚀 正在為 {len(names)} 個景點生成描述...")
    
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=generate_content_config,
    )

    try:
        # 解析 AI 回傳的 JSON
        enhanced_data = json.loads(response.text)
        
        # 將新的描述合併回原本的資料中（保留可能有的 source_url 等）
        desc_map = {item['name']: item['description'] for item in enhanced_data['attractions']}
        
        for attr in attraction_json['attractions']:
            attr['description'] = desc_map.get(attr['name'], "暫無描述")
            
        return attraction_json

    except Exception as e:
        print(f"❌ 解析失敗: {e}")
        return attraction_json

# --- 測試執行 ---
if __name__ == "__main__":
    # 這是你剛才拿到的原始 JSON
    raw_json = {
        "location": "台北",
        "attractions": [{"name": "台北101"}, {"name": "西門"}, {"name": "陽明山"}] # 簡化測試
    }
    
    final_result = fetch_descriptions(raw_json)
    
    # 儲存結果
    with open("final_trip_data.json", "w", encoding="utf-8") as f:
        json.dump(final_result, f, ensure_ascii=False, indent=4)
        
    print("✅ 描述補完完畢！已存至 final_trip_data.json")