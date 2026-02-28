from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import date

class SearchRequest(BaseModel):
    location: str

class ImageData(BaseModel):
    url: str
    source: str

class Spot(BaseModel):
    id: int
    input_region: str
    city: str
    attraction: str
    description: str
    geo_tags: str
    google_place_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    images: List[ImageData] = []

class SearchResponse(BaseModel):
    message: str
    data: List[Spot]


class TripPlaceIn(BaseModel):
    google_place_id: str = Field(min_length=1)

class TripCreateIn(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    days: int = Field(ge=1, le=60)
    start_date: Optional[date] = None
    places: List[TripPlaceIn] = Field(default_factory=list)  
    # 如果你在建立這個物件時沒有提供 places 資料，程式會自動幫你建立一個空的列表 []。

class TripCreateOut(BaseModel):
    trip_id: int


class TripOut(BaseModel):
    trip_id: int
    title: str
    days: int
    start_date: Optional[str] = None  # 先用 str，避免 datetime/序列化麻煩

class TripPlaceOut(BaseModel):
    destination_id: int
    place_name: Optional[str] = None
    city_name: Optional[str] = None
    google_place_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    cover_url: Optional[str] = None

class AddTripPlaceIn(BaseModel):
    google_place_id: str
    # 先允許前端（Autocomplete）把資訊一起帶來，後端就不用先串 Places Details
    place_name: Optional[str] = None
    city_name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

class OkOut(BaseModel):
    ok: bool = True


class SignupIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    name: str = Field(min_length=2, max_length=30)

class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)

class UserOut(BaseModel):
    id: int
    email: EmailStr
    name: str



