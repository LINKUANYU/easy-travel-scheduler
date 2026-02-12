from pydantic import BaseModel
from typing import List

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
    images: List[ImageData] = []

class SearchResponse(BaseModel):
    message: str
    data: List[Spot]