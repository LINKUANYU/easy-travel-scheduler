from fastapi import *

router = APIRouter()

@router.get("/api/test")
def say_hi(request: Request):
    return {"ok": True}