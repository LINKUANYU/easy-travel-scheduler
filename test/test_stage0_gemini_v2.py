from google import genai
from google.genai.types import Tool, GenerateContentConfig
import os
from dotenv import load_dotenv
load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
model_id = "gemini-3-flash-preview"

tools = [
  {"url_context": {}},
]

location = "大阪"
url1 = "https://www.gltjp.com/zh-hant/article/item/20172/"
url2 = "https://bobbyfun.tw/2024-03-06-3077/"

prompt = f"""
    請閱讀並分析以下網址內容：
    {url1}, {url2}

    # 任務
    1. 提取所有關於「{location}」的旅遊景點。
    2. **去重處理**：相同景點僅保留一個。
    3. **描述生成**：參考網頁中的介紹，為每個景點撰寫一段 50 字內、生動且具吸引力的描述。
    
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
for each in response.candidates[0].content.parts:
    print(each.text)

print("--------------------")

# For verification, you can inspect the metadata to see which URLs the model retrieved
print(response.candidates[0].url_context_metadata)