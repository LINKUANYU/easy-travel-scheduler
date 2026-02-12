from fastapi import *
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()


# 設定允許存取的來源
origins = [
    "http://localhost:3000", # Next.js 預設網址
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/hello")
async def hello():
    return {"message": "成功連線到 FastAPI！"}