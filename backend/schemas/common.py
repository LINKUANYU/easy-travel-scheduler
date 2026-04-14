from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import date

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

class OkOut(BaseModel):
    ok: bool = True

