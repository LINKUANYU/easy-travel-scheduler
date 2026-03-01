import os
import requests
import json
from dotenv import load_dotenv
load_dotenv()
from fastapi import HTTPException


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
        "X-Goog-FieldMask": "places.location,places.id,places.displayName,places.formattedAddress" 
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
            address = place.get("formattedAddress", "查無地址")
            return lat, lng, place_id, address
    
    return None, None, None, None


# AddressComponent 結構：longText/shortText/types/languageCode :contentReference[oaicite:2]{index=2}
CITY_TYPE_PRIORITY = [
    "locality",                 # 常見的 city
    "postal_town",              # 部分國家用這個
    "administrative_area_level_2", # 次級行政區
    "administrative_area_level_1", # 最高級行政區
]

def _extract_city_name(address_components: list[dict]) -> str | None:
    if not address_components:
        return None

    # 建 type -> component 的索引（同一 type 可能多個，這裡先取第一個）
    type_map: dict[str, dict] = {}
    for c in address_components:
        for t in c.get("types", []) or []:
            type_map.setdefault(t, c)

    for t in CITY_TYPE_PRIORITY:
        c = type_map.get(t)
        if c and c.get("longText"):
            return c["longText"]

    return None

def fetch_place_details_new(place_id: str) -> dict:
    """
    回傳你寫入 destinations 所需的最小資料：
    place_name, address, city_name, lat, lng
    """
    if not MAPS_API_KEY:
        raise RuntimeError("Missing GOOGLE_PLACES_API_KEY")

    place_id = (place_id or "").strip()
    if not place_id:
        raise HTTPException(status_code=400, detail="place_id is required")

    # FieldMask：Place Details (New) 必填，否則報錯 :contentReference[oaicite:3]{index=3}
    field_mask = "id,displayName,formattedAddress,location,addressComponents"

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": MAPS_API_KEY,
        "X-Goog-FieldMask": field_mask,
    }

    url = f"https://places.googleapis.com/v1/places/{place_id}?languageCode=zh-TW"
    try:
        r = requests.get(url, headers=headers, timeout=10)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Places Details request failed: {e}")

    if r.status_code != 200:
        # 常見：key 沒開 Places API (New) / 權限 / billing / referrer 限制
        raise HTTPException(status_code=502, detail=f"Places Details error: {r.status_code} {r.text}")

    data = r.json()

    place_name = (data.get("displayName") or {}).get("text")
    address = data.get("formattedAddress")
    loc = data.get("location") or {}
    lat = loc.get("latitude")
    lng = loc.get("longitude")

    city_name = _extract_city_name(data.get("addressComponents") or [])

    return {
        "place_name": place_name,
        "address": address,
        "city_name": city_name,
        "lat": lat,
        "lng": lng,
    }
