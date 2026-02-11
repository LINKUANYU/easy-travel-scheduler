from google import genai
from google.genai import types
import os
from dotenv import load_dotenv
load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

def get_attractions_from_url(target_url):
    # 在 Prompt 裡強調 JSON 格式
    prompt = f"""
    請分析這個網頁內容：{target_url}
    提取所有旅遊景點，並回傳純 JSON 格式（不要包含 Markdown 的 ```json 標籤）。
    格式範例：
    {{
        "location": "城市名",
        "attractions": [
            {{"name": "景點名", "description": "簡介"}}
        ]
    }}
    """
    
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
        config=types.GenerateContentConfig(
            tools=[types.Tool(url_context=types.UrlContext())]
            # 這裡刪除 response_mime_type="application/json"
        )
    )
    
    # 因為 AI 可能還是會吐出 ```json ... ``` 標籤，我們做個簡單的清理
    raw_text = response.text.strip().replace("```json", "").replace("```", "")
    return raw_text

print(get_attractions_from_url("https://www.gltjp.com/zh-hant/article/item/20187/"))