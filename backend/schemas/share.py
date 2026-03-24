from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import date

class SharedTripInfo(BaseModel):
    trip_id: int
    title: str
    days: int
    start_date: Optional[str] = None
    user_id: Optional[int] = None  # 讓前端知道誰是擁有者

class SharedItineraryItem(BaseModel):
    item_id: int
    day_index: int
    position: int
    destination_id: int
    place_name: str
    lat: Optional[float] = None
    lng: Optional[float] = None
    google_place_id: Optional[str] = None
    arrival_time: Optional[str] = None
    departure_time: Optional[str] = None
    travel_mode: Optional[str] = None
    duration_millis: Optional[int] = None
    distance_meters: Optional[int] = None

class SharedTripDataOut(BaseModel):
    trip: SharedTripInfo
    # 字典格式，Key 是天數字串 (例如 "1", "2")，Value 是該天的景點陣列
    itinerary: dict[int, list[SharedItineraryItem]]
