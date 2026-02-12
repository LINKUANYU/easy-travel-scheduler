from pydantic import BaseModel
from typing import List

class SearchRequest(BaseModel):
    location: str

class ImageData(BaseModel):
    url: str
    source: str

class Spot(BaseModel):
    city: str
    attraction: str
    description: str
    images: List[ImageData]

class SearchResponse(BaseModel):
    message: str
    data: List[Spot]