"""
conftest.py — 整合測試的共用設定

啟動 TestClient 時，main.py 會 import database.py，
database.py 在 module 載入時就建立 DB 連線池（POOL = PooledDB(...)）。
所以即使是「不需要 DB 的測試」，pytest 也必須能連到 DB 才能 import app。

解法：在這裡用 app.dependency_overrides 替換掉 get_cur，
FastAPI 有一個 dependency_overrides 字典，
讓你在測試時把任何 Depends(xxx) 換成你指定的 function。
原本 get_cur 會連真實 DB，這裡把它換成 mock_get_cur_no_data，
之後所有用到 Depends(get_cur) 的 endpoint 都會拿到假的 cursor。

讓測試可以自己決定「要不要用真實 DB」。
"""

import os
# 在 import main 之前先補好 .env，確保連線池能初始化
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# .env 裡 DB_HOST=host.docker.internal 是 Docker 環境專用的 hostname。
# 本機跑 pytest 時 Docker 網路不存在，改用 127.0.0.1。
os.environ["DB_HOST"] = "127.0.0.1"

import secrets
import pymysql
import pytest
from fastapi.testclient import TestClient
from main import app
from core.database import get_cur


class MockCursor:
    """模擬資料庫 cursor，固定回傳 None（代表查無資料）"""
    def execute(self, *args, **kwargs):
        pass

    def fetchone(self):
        return None

    def fetchall(self):
        return []

    def close(self):
        pass


def mock_get_cur_no_data():
    """永遠回傳查無資料的 cursor，用於測試 404 情境"""
    yield MockCursor()


@pytest.fixture(scope="function")
def client_no_db():
    """
    使用假 cursor 的 TestClient。
    cursor 固定回傳 None，適合測試「找不到資料 → 404」的情境。
    不需要真實資料庫連線。
    """
    app.dependency_overrides[get_cur] = mock_get_cur_no_data # 替換成假的 cursor
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture(scope="session")
def client_with_db():
    """
    使用真實 DB 的 TestClient。
    需要 .env 裡的 DB 設定正確，且資料庫可連線。
    """
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="function")
def db_trip():
    """
    Strategy B：測試開始前 INSERT 測試資料，測試結束後 DELETE。

    直接用 pymysql 連 DB（繞過 FastAPI），這樣測試資料的生命週期
    完全由 fixture 控制，不會受到 TestClient 的 transaction 影響。

    因為 trips 設有 ON DELETE CASCADE，刪掉 trip 後
    itinerary_items、itinerary_legs 等子資料會自動一起清掉。
    """
    conn = pymysql.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ.get("DB_PORT", 3306)),
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        database=os.environ["DB_NAME"],
        cursorclass=pymysql.cursors.DictCursor,
    )

    token = secrets.token_urlsafe(16)  # 每次產生不同的 token，避免衝突

    try:
        with conn.cursor() as cur:
            # ── Arrange：INSERT 測試用的 trip ──────────────────
            cur.execute(
                """
                INSERT INTO trips (title, days, share_token)
                VALUES (%s, %s, %s)
                """,
                ("測試行程", 2, token),
            )
            trip_id = cur.lastrowid  # 拿到剛剛 INSERT 的 id
            conn.commit()

        # yield 把測試需要的資料交給測試函式
        yield {"trip_id": trip_id, "share_token": token}

    finally:
        # ── Teardown：不管測試成功或失敗，都清掉測試資料 ──────
        with conn.cursor() as cur:
            cur.execute("DELETE FROM trips WHERE id = %s", (trip_id,))
        conn.commit()
        conn.close()
