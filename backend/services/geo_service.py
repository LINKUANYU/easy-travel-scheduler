import os
import requests
import json
from dotenv import load_dotenv
load_dotenv()


MAPS_API_KEY = os.getenv("MAPS_API_KEY")

def get_coordinates(location_name):
    if not MAPS_API_KEY:
        print("❌ 錯誤：找不到 MAPS_API_KEY，請檢查你的 .env 檔案！")
        return None, None, None
    

    url = "https://places.googleapis.com/v1/places:searchText"
    
    # 設定 Header，這裡就是「新版」的關鍵：Field Mask
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": MAPS_API_KEY,
        "X-Goog-FieldMask": "places.location,places.id,places.displayName" 
    }
    
    # 請求主體
    data = {
        "textQuery": location_name,
        "languageCode": "zh-TW"
    }
    
    response = requests.post(url, headers=headers, json=data)
    
    if response.status_code == 200:
        result = response.json()
        if "places" in result and len(result["places"]) > 0:
            place = result["places"][0]
            lat = place["location"]["latitude"]
            lng = place["location"]["longitude"]
            place_id = place["id"]
            return lat, lng, place_id
    
    return None, None, None

