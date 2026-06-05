from dotenv import load_dotenv

load_dotenv()
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.concurrency import run_in_threadpool
from router import auth, trips, itinerary, share, search
from core.database import POOL
import asyncio
import os


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


def _check_db() -> None:
    """
    同步函式：從連線池拿一條連線、執行 SELECT 1、再歸還。
    這是會「阻塞」的操作（PyMySQL 是同步驅動），所以在 health_check 裡
    要用 run_in_threadpool 丟到執行緒池跑，避免卡住 FastAPI 的 event loop。

    注意：這裡刻意「不」使用 get_conn 依賴，因為 get_conn 在連線池耗盡時
    是 blocking=True 會永遠等待。健康檢查必須自己掌控逾時，否則檢查本身
    也會跟著卡死，就失去偵測卡死的意義了。
    """
    conn = POOL.connection()  # ping=4 會在下方 execute 前自動檢測殭屍連線
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()
    finally:
        conn.close()  # PooledDB 的 close 是把連線歸還池子，不是真的關閉


@app.get("/health")
async def health_check(response: Response):
    """
    輕量健康檢查：除了確認服務本身活著，還會實際對 DB 下一個 SELECT 1，
    並設定 3 秒逾時。若 DB 卡死或查不到，回 HTTP 503，
    讓 Docker healthcheck（curl -f）偵測到失敗，進而自動重啟容器。
    """
    try:
        # asyncio.wait_for 設定 3 秒逾時：DB 若在 3 秒內沒回應 SELECT 1，
        # 就拋出 TimeoutError，判定為不健康。這是「偵測卡死」的關鍵。
        await asyncio.wait_for(run_in_threadpool(_check_db), timeout=3.0)
        return {"status": "ok", "db": "ok"}
    except asyncio.TimeoutError:
        # DB 查詢超過 3 秒沒回應 → 極可能就是連線池卡死的情況
        response.status_code = 503
        return {"status": "unhealthy", "db": "timeout"}
    except Exception as e:
        # 其他 DB 錯誤（連線被拒、SQL 失敗等）
        response.status_code = 503
        return {"status": "unhealthy", "db": "error", "detail": str(e)}
