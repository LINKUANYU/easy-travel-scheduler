import os
import requests
import json
from dotenv import load_dotenv

# 1. 讀取 .env 裡的 MAPS_API_KEY
load_dotenv()
api_key = os.getenv("MAPS_API_KEY")

if not api_key:
    print("❌ 錯誤：找不到 MAPS_API_KEY，請檢查你的 .env 檔案！")
    exit()

# 2. 設定請求網址 (Places API New)
url = "https://places.googleapis.com/v1/places:searchText"

# 3. 設定表頭 (Headers) - 這裡有兩個重點！
headers = {
    "Content-Type": "application/json",
    "X-Goog-Api-Key": api_key,
    # ⚠️ 省錢關鍵：FieldMask (欄位遮罩)
    # 我們只要求 id, displayName, location, photos 這四個欄位
    # 如果不寫這一行，Google 會給你所有資料，然後收你比較貴的費用！
    "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.photos"
}

# 4. 設定搜尋內容
payload = {
    "textQuery": "福岡塔"  # 你可以隨便改成你想搜的地點，例如 "台北101"
}

# 5. 發送請求
print(f"🔍 正在向 Google Maps 查詢 '{payload['textQuery']}'...")
try:
    response = requests.post(url, headers=headers, json=payload)
    
    # 檢查狀態碼
    if response.status_code == 200:
        data = response.json()
        print("\n✅ 測試成功！搜尋結果如下：")
        print("------------------------------------------------")
        # 漂亮地印出 JSON
        print(json.dumps(data, indent=2, ensure_ascii=False))
        print("------------------------------------------------")
        
        # 小小的資料解析示範
        if "places" in data:
            first_place = data["places"][0]
            name = first_place.get("displayName", {}).get("text")
            lat = first_place.get("location", {}).get("latitude")
            lng = first_place.get("location", {}).get("longitude")
            print(f"\n📍 解析示範：")
            print(f"地點名稱: {name}")
            print(f"經緯度: {lat}, {lng}")
            if "photos" in first_place:
                print(f"照片 ID (第一張): {first_place['photos'][0]['name']}")
            else:
                print("照片: 此地點無照片")
    else:
        print(f"\n❌ 測試失敗，狀態碼：{response.status_code}")
        print("錯誤訊息：", response.text)

except Exception as e:
    print(f"\n❌ 連線錯誤：{e}")