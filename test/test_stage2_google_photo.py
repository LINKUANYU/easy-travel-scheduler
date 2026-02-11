import os
from dotenv import load_dotenv
load_dotenv()
import requests

GOOGLE_CUSTOM_SEARCH_KEY = os.getenv('GOOGLE_CUSTOM_SEARCH_KEY')

def search_google_images(query, api_key, cx, num=5):
    url = "https://www.googleapis.com/customsearch/v1"
    params = {
        'q': query,
        'key': api_key,
        'cx': cx,
        'searchType': 'image', # 關鍵：指定只要圖片
        'num': num,            # 回傳數量 (1-10)
        'imgSize': 'large',    # 可選：指定圖片大小
        'safe': 'active'       # 可選：開啟安全搜尋
    }
    
    response = requests.get(url, params=params)
    if response.status_code != 200:
        print(f"Status Code: {response.status_code}")
        print(f"Error Detail: {response.text}") # 這行會告訴你具體是哪裡出錯
    
    if response.status_code == 200:
        data = response.json()
        items = data.get('items', [])
        
        results = []
        for item in items:
            results.append({
                'title': item.get('title'),
                'link': item.get('link'),      # 圖片原始連結
                'thumbnail': item.get('image', {}).get('thumbnailLink'), # 縮圖
                'context': item.get('image', {}).get('contextLink')    # 來源網頁
            })
        print(results)
        return results
    else:
        print(f"Error: {response.status_code}")
        return None

# 使用範例
SEARCH_ENGINE_ID = "002aa5380f6714870"
images = search_google_images("台北101", GOOGLE_CUSTOM_SEARCH_KEY, SEARCH_ENGINE_ID)