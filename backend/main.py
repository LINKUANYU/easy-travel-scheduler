from fastapi import *
from fastapi.middleware.cors import CORSMiddleware
from router import destination, auth

app = FastAPI()

# 設定允許存取的來源
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000", # Next.js 預設網址
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(destination.router)
app.include_router(auth.router)




