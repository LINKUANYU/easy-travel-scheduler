from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional

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
