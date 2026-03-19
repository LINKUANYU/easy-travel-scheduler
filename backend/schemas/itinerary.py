from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import date


class ItineraryAddIn(BaseModel):
    destination_id: int

class ItineraryItemOut(BaseModel):
    item_id: int
    trip_id: int
    day_index: int
    position: int
    destination_id: int
    place_name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    google_place_id: Optional[str] = None
    arrival_time: Optional[str] = None
    departure_time: Optional[str] = None

class ItinerarySummaryRow(BaseModel):
    destination_id: int
    day_index: int
    position: int
    item_id: int

class ItineraryReorderIn(BaseModel):
    ordered_item_ids: List[int]


class ItineraryItemTimeIn(BaseModel):
    item_id: int
    arrival_time: Optional[str] = None
    departure_time: Optional[str] = None


class ItineraryLegIn(BaseModel):
    from_item_id: int
    to_item_id: int
    travel_mode: str
    duration_millis: Optional[int] = None
    distance_meters: Optional[int] = None


class ItinerarySaveDayIn(BaseModel):
    ordered_item_ids: List[int]
    item_times: List[ItineraryItemTimeIn] = []
    legs: List[ItineraryLegIn] = []
