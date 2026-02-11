# To run this code you need to install the following dependencies:
# pip install google-genai

import os
from google import genai
from google.genai import types
from dotenv import load_dotenv
load_dotenv()
import json
from ddgs import DDGS
from db.database import *
from fastapi import Depends


def search_with_duckduckgo(location):
    # 🔍 Debug: 先印出來看看，確定真的有傳對關鍵字進去
    print(f"🕵️ 正在向 DuckDuckGo 查詢關鍵字：[{location}]") 
    
    results = []
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
                max_results=10
            )
            
            for r in ddgs_gen:
                results.append(f"摘要: {r['body']}")
                
    except Exception as e:
        print(f"⚠️ 搜尋發生錯誤: {e}")
    
    if not results:
        print("❌ 警告：搜尋結果為空！請檢查關鍵字是否正確。")
        
    results = "\n\n".join(results)

    return results



def process_attractions_to_db(raw_search_data, location):
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    
    # 整合後的 System Instruction：定義角色、任務與格式
    system_instruction = f"""
    # Role
    你是一位專業的旅遊分析師與編輯，擅長從原始資料中提取景點並撰寫吸引人的描述。

    # Task
    1. 從使用者提供的「原始搜尋結果」中提取「{location}」的景點。
    2. 去重處理：相同景點僅保留一個。
    3. 為每個景點撰寫描述。

    # Description Rules
    1. 每個景點描述限 50 字以內，語氣生動活潑。
    2. 必須包含該景點的「必去理由」或「特色」。
    3. 若該項是區域（如：新宿），請描述其整體旅遊氛圍。

    # Output Format (JSON Only)
    請嚴格回傳以下格式：
    {{
        "location": "{location}",
        "attractions": [
            {{
                "name": "景點名稱",
                "description": "50字內的活潑描述"
            }}
        ]
    }}
    """

    generate_content_config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        response_mime_type="application/json",
        temperature=0.3, # 稍微調高一點點讓文字更生動，但保持結構穩定
    )

    print(f"🚀 正在分析 {location} 的資料並生成描述...")
    
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash", # 建議使用 2.5 flash，速度快且 JSON 穩定
            contents=raw_search_data,
            config=generate_content_config,
        )

        # 直接解析為 Python 字典
        result_data = json.loads(response.text)
        
        
        return result_data

    except Exception as e:
        print(f"❌ 處理失敗: {e}")
        return None


def write_into_db(ai_gen_data):
    # 因測試用沒有用Fastapi所以先不用Depends
    conn = POOL.connection()

    city_name = ai_gen_data['location']
    attractions = ai_gen_data['attractions']
    data_to_insert = [
        (city_name, attraction['name'], attraction['description'])
        for attraction in attractions
    ]

    try:
        cur = conn.cursor()
        sql = "INSERT INTO destinations(city_name, place_name, description) VALUES(%s, %s, %s)"
        cur.executemany(sql, data_to_insert)
        
        conn.commit()
        print(f"✅ 成功寫入 {len(data_to_insert)} 筆資料到本地 MySQL")
    except pymysql.MySQLError as e:
        conn.rollback() 
        print(f"Database error: {e}")
        raise HTTPException(status_code=500, detail="Database insertion failed")
    finally:
        cur.close()



location = "名古屋"
raw_search_data = search_with_duckduckgo(f"{location} 旅遊遊記 必去景點")
ai_gen_data = process_attractions_to_db(raw_search_data, location)
write_into_db(ai_gen_data)









# def generate(data, location):
#     client = genai.Client(
#         api_key=os.getenv("GEMINI_API_KEY"),
#     )

#     model = "gemini-2.5-flash"
#     contents = [
#         types.Content(
#             role="user",
#             parts=[
#                 types.Part.from_text(text=data),
#             ],
#         ),
#     ]

#     generate_content_config = types.GenerateContentConfig(
#         system_instruction=[
#             types.Part.from_text(text="""# Role
#                 你是一位專業的旅遊資料分析師，擅長從混亂的搜尋結果中提取結構化資訊。

#                 # Task
#                 請分析使用者提供的「原始搜尋結果」，提取出裡面提到的「景點名稱」。

#                 # Rules
#                 1. **去重處理**：不同的搜尋結果可能會提到同一個景點（例如：美麗海水族館），請合併為同一個項目，不要重複。
#                 2. **過濾雜訊**：忽略無關的文字（如：廣告、贊助、通用描述）。
#                 3. **輸出格式**：嚴格以 JSON 格式回傳，格式如下：
#                 {
#                 \"location\": \"地點名稱\",
#                 \"attractions\": [
#                     {
#                     \"name\": \"景點名稱\",
#                     }
#                 ]
#             }"""),
#         ],
#     # 強制要求輸出 JSON 格式 (在 2.0 flash 效果極佳)
#         response_mime_type="application/json",
#     )

#     print("--- AI 正在處理中 ---")
#     response = client.models.generate_content(
#         model=model,
#         contents=contents,
#         config=generate_content_config,
#     )
    
#     result_text = response.text
#     print(result_text)
#     # ---------- 新增：將結果寫入檔案 ----------
#     filename = f"{location}_analysis.json"
    
#     try:
#         # 將 AI 回傳的字串轉為 Python 字典，這樣寫入檔案時排版會更漂亮 (加上 indent)
#         json_data = json.loads(result_text)
        
#         with open(filename, "w", encoding="utf-8") as f:
#             json.dump(json_data, f, ensure_ascii=False, indent=4)
            
#         print(f"✅ 檔案已成功儲存至: {filename}")
        
#     except Exception as e:
#         # 如果解析 JSON 失敗，就直接存成純文字
#         print(f"⚠️ JSON 解析失敗，改存為純文字檔。錯誤: {e}")
#         with open("result_raw.txt", "w", encoding="utf-8") as f:
#             f.write(result_text)

#     return result_text




# location = "東京 旅遊遊記 必去景點"
# data = search_with_duckduckgo(location)
# generate(data, location)

