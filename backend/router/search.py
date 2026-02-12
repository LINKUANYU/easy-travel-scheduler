from fastapi import APIRouter
from model.spot import *
from services.search_api import *

router = APIRouter()

@router.post("/api/search", response_model=SearchResponse)
async def search_spot(payload: SearchRequest):
    location = payload.location
    urls = search_spot_url(location)
    print(urls)
    ai_gen_data = parse_spot_url(urls, location)
    img_data = search_attraction_imgs(ai_gen_data)
    data = combine_data(ai_gen_data, img_data)
    print(data)
    return {"message":"success", "data": data}
