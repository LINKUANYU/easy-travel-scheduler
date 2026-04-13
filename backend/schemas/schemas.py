from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import date

class SearchRequest(BaseModel):
    location: str
    allow_scrape: bool = True

class SearchMore(BaseModel):
    location: str

class ImageData(BaseModel):
    url: str
    source: str

class Attraction(BaseModel):
    id: int
    input_region: str
    city: str
    attraction: str
    description: str
    geo_tags: Optional[str] = Field(default="")
    google_place_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    images: List[ImageData] = []


class TripCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    days: int = Field(ge=1, le=60)
    start_date: Optional[date] = None


class TripCreateOut(BaseModel):
    trip_id: int
    edit_token: Optional[str] = None


class TripOut(BaseModel):
    trip_id: int
    title: str
    days: int
    start_date: Optional[str] = None  # 先用 str，避免 datetime/序列化麻煩
    share_token: Optional[str] = None
    cover_url: Optional[str] = None  # 保留未來擴充
    first_place_id: Optional[str] = None

class TripPlaceOut(BaseModel):
    destination_id: int
    place_name: Optional[str] = None
    city_name: Optional[str] = None
    google_place_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

class AddTripPlaceIn(BaseModel):
    google_place_id: str
    # 先允許前端（Autocomplete）把資訊一起帶來，後端就不用先串 Places Details
    place_name: Optional[str] = None
    city_name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None







class OkOut(BaseModel):
    ok: bool = True

