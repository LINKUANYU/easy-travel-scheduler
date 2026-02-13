from pydantic import BaseModel
from typing import List, Optional

class SearchRequest(BaseModel):
    location: str

class ImageData(BaseModel):
    url: str
    source: str

class Spot(BaseModel):
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