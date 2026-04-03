from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from router import auth, trips, itinerary,share, search
import logging
import os

# 日誌過濾器：專門消音特定 API 的存取紀錄
class EndpointFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        # 如果這行 Log 的訊息裡面包含 "/api/image-proxy"，就回傳 False (不印出)
        return "/api/image-proxy" not in record.getMessage()

# 將過濾器掛載到 Uvicorn 的 access logger 上
logging.getLogger("uvicorn.access").addFilter(EndpointFilter())


app = FastAPI()

# 設定允許存取的來源
cors_origins_str = os.getenv("CORS_ORIGINS", "http://localhost:3000")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins_str,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(search.router)
app.include_router(auth.router)
app.include_router(trips.router)
app.include_router(itinerary.router)
app.include_router(share.router)



