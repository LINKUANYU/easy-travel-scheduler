# easy-travel-scheduler 資料庫層改造計畫：DBUtils → SQLAlchemy Async

> 將現行「同步 PyMySQL + DBUtils.PooledDB + raw SQL」的資料存取層，改造為「SQLAlchemy 2.0 AsyncEngine + AsyncSession」的非同步架構，從根本上獲得 `pool_pre_ping`、`pool_recycle`、`pool_timeout` 等業界標準的連線池健康管理機制。

---

## 〇、文件定位與前情提要

本文件是「**方案三**」的完整規劃，屬於**未來的獨立重構任務**，不是當前緊急修復。

### 當前已採用的修復（方案一，已完成）

長時間運行後連線池卡死的問題，已先用**最小改動**修復：

| 已修改檔案 | 改動 | 作用 |
|-----------|------|------|
| `backend/core/database.py` | `PooledDB` 加上 `ping=4` | 執行 query 前自動偵測並汰換殭屍連線 |
| `backend/main.py` | `/health` 加入 `SELECT 1` + 3 秒逾時，失敗回 503 | 讓 Docker healthcheck 能偵測 DB 卡死並自動重啟容器 |

> 方案一已能 **100% 解決**殭屍連線卡死問題。本文件的方案三是「更現代化、更完整」的長期方向，**並非為了修這個 bug 而做**，而是當專案未來需要真正的非同步 DB 效能、或想統一技術棧時才執行。

### 為什麼還需要方案三？

方案一解決了「連線健康」，但沒有改變一個事實：**目前所有 DB 操作都是同步阻塞的**。在高併發場景下，同步 DB 查詢會佔用 FastAPI 的 threadpool 執行緒（預設 40 條），成為吞吐量上限。方案三讓 DB 查詢變成 `await`，能讓單一 worker 處理更多併發請求。

---

## 一、改造背景與痛點

### 現行架構痛點

1. **DBUtils 缺少精準的連線生命週期控制**
   - 沒有 `pool_recycle`：無法設定「連線存活超過 N 秒就強制汰換」，只能靠 `ping` 被動偵測。
   - `ping` 是 bitmask 設計，語意不直覺（`ping=1` 只在建立時檢查，容易誤解）。
   - `blocking=True` 在連線池耗盡時會**永遠等待**，沒有 `pool_timeout` 可設上限，請求可能無限 hang。

2. **同步阻塞限制併發吞吐**
   - 所有 route 都是 `def`（同步），FastAPI 丟進 threadpool 跑。
   - threadpool 預設 40 條執行緒，是高併發下的硬上限。
   - DB I/O 等待期間執行緒被佔住，無法服務其他請求。

3. **raw SQL 字串散落各處，缺乏型別與結構**
   - SQL 以字串硬寫在 repository 與 dependency 中。
   - 沒有 ORM 模型，欄位變更時無編譯期檢查，靠人工同步。

### 改造方向

- **AsyncEngine + AsyncSession**：DB 操作全面 `await` 化。
- **`pool_pre_ping=True`**：等同方案一的 `ping=4`，取連線前先檢測。
- **`pool_recycle=1800`**：連線存活 30 分鐘強制汰換，永遠不會碰到 RDS 的 8 小時 `wait_timeout`。
- **`pool_timeout=10`**：取連線最多等 10 秒，逾時拋例外而非無限等待。
- **保留 raw SQL（漸進式）或導入 ORM Model（完整式）** 二選一，見第四節。

---

## 二、決策總結

### 2.1 技術選型

| 項目 | 現行 | 改造後 |
|------|------|--------|
| 連線池 | `DBUtils.PooledDB` | `SQLAlchemy AsyncEngine` 內建連線池 |
| DB 驅動 | `PyMySQL`（同步） | `aiomysql`（非同步） |
| Session 取得 | `POOL.connection()` | `async_sessionmaker` 產生 `AsyncSession` |
| Route 風格 | `def`（同步，走 threadpool） | `async def`（非同步，走 event loop） |
| Cursor | `pymysql.cursors.DictCursor` | `AsyncSession.execute()` 回傳 `Result` |
| 健康檢測 | `ping=4` | `pool_pre_ping=True` |
| 連線汰換 | 無（靠 ping 被動） | `pool_recycle=1800` 主動汰換 |
| 取連線逾時 | 無（`blocking=True` 永久等） | `pool_timeout=10` |

### 2.2 驅動選擇：為什麼是 aiomysql

| 驅動 | 說明 | 建議 |
|------|------|------|
| `aiomysql` | 最成熟的 async MySQL 驅動，SQLAlchemy 官方支援良好 | ✅ 推薦 |
| `asyncmy` | 較新、效能略好，但生態與穩定度稍遜 | 進階可選 |

連線字串格式：`mysql+aiomysql://user:password@host:port/dbname?charset=utf8mb4`

### 2.3 改造範圍策略：漸進式 vs 完整式

| 策略 | 說明 | 工程量 | 風險 |
|------|------|--------|------|
| **漸進式（推薦）** | 只換連線池與 session 取得方式，**保留現有 raw SQL**，用 `session.execute(text(...))` 包裝 | 中 | 低 |
| **完整式** | 連同導入 ORM Model、改寫所有 SQL 為 ORM 查詢 | 大 | 中高 |

> **本計畫主推「漸進式」**：先用最小語法改動拿到 async 連線池的所有好處，ORM 化可作為更後期的獨立階段。下面的步驟皆以漸進式為主軸。

---

## 三、影響範圍清單（實際掃描結果）

以下是目前**直接或間接使用 DB 連線**的所有檔案，全部需要配合改造：

### 3.1 核心層（必改）

| 檔案 | 現況 | 改造重點 |
|------|------|---------|
| `backend/core/database.py` | `PooledDB` + `get_conn` + `get_cur` 同步 generator | 改為 `create_async_engine` + `async_sessionmaker` + `get_db` async generator |
| `backend/core/dependencies.py` | `get_current_user` / `assert_trip_owner` / `get_optional_user` 用 `cur=Depends(get_cur)` | 改為 `db: AsyncSession = Depends(get_db)`，內部查詢改 `await db.execute(...)`，函式改 `async def` |

### 3.2 Repository 層（必改）

| 檔案 | 現況 | 改造重點 |
|------|------|---------|
| `backend/repositories/destination_repo.py` | `get_existing_destinations(location, cur)`、`save_spot_data(data, cur)` | 簽名改收 `session`，`cur.execute` → `await session.execute(text(sql), params)`，`cur.fetchall()` → `result.mappings().all()` |

### 3.3 Router 層（全部必改）

| 檔案 | 主要 endpoint | 改造重點 |
|------|--------------|---------|
| `backend/router/auth.py` | `/api/signup`、`/api/login`、`/api/me`、`/api/logout` | `def` → `async def`，`cur=Depends(get_cur)` → `db=Depends(get_db)` |
| `backend/router/search.py` | `/api/search`、`/api/popular-searches` 等 | 同上；注意 `redis_cache` 裝飾器目前是同步，需處理（見 3.6） |
| `backend/router/trips.py` | 行程 CRUD | 同上 |
| `backend/router/itinerary.py` | 行程細項 CRUD | 同上 |
| `backend/router/share.py` | 分享相關 | 同上 |

### 3.4 背景任務層（必改，且要特別小心）

| 檔案 | 現況 | 改造重點與注意事項 |
|------|------|-------------------|
| `backend/worker/tasks.py` | Celery task 內 `POOL.connection()` 同步取連線 | **Celery worker 預設是同步進程**。兩種選擇：(a) Celery task 內維持「另建同步 engine」只給 worker 用；(b) 在 task 內用 `asyncio.run()` 跑 async session。建議 (a)，避免 event loop 與 Celery 衝突 |
| `backend/services/background.py` | `generate_trip_cover_task` 同步 `POOL.connection()` | 此為 FastAPI BackgroundTasks 呼叫，可改用 async session 或維持同步 engine |

> ⚠️ **關鍵風險點**：Celery 與 async 的整合是本次改造**最容易出錯**的地方。Celery 5.x 對 async task 的支援仍不完整，強烈建議 worker 端**保留一套獨立的同步 engine**（可同樣用 SQLAlchemy 的同步 `create_engine` 搭配 `pool_pre_ping` / `pool_recycle`），而非強行讓 worker 跑 async。

### 3.5 測試層（必改）

| 檔案 | 現況 | 改造重點 |
|------|------|---------|
| `backend/test/conftest.py` | `MockCursor`、`client_no_db`、`client_with_db`、`db_trip` fixtures | `MockCursor` 需改為 mock `AsyncSession`；測試 client 需支援 async（`httpx.AsyncClient` + `pytest-asyncio`） |

### 3.6 連帶需處理的細節

1. **`redis_cache` 裝飾器**（`backend/core/redis.py`）
   - 目前 `wrapper` 是同步 `def`，包在 async route 上會出問題。
   - 需新增一個 async 版本的裝飾器（`async def wrapper` + `await func(...)`）。

2. **`set_utc`（設定連線時區為 UTC）**
   - 現行在每次 `get_conn` 時執行 `SET time_zone='+00:00'`。
   - SQLAlchemy 可改用 engine 的 `connect_args` 或 event listener 統一設定，避免每次手動執行。

3. **commit / rollback 語意**
   - 現行 `get_conn` 在 route 正常結束時 `commit`、例外時 `rollback`。
   - async 版的 `get_db` 需保留同樣語意（`async with session.begin()` 或手動 `await session.commit()` / `await session.rollback()`）。

---

## 四、改造步驟（漸進式）

### Step 0：前置準備

1. 在 `requirements.txt` 加入：
   ```
   aiomysql
   # SQLAlchemy 已存在，確認版本 >= 2.0
   ```
2. 建立一個 feature branch，例如 `refactor/async-db`。
3. 確認測試在改造前全部綠燈（作為改造後的對照基準）。

### Step 1：改寫 `core/database.py`（核心）

```python
# 改造後示意（漸進式，保留 raw SQL 能力）
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
import os

DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT", 3306))
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")

DATABASE_URL = (
    f"mysql+aiomysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    "?charset=utf8mb4"
)

# 🌟 三道防線一次補齊
engine = create_async_engine(
    DATABASE_URL,
    pool_size=5,           # 對應原本 maxconnections=5
    max_overflow=10,       # 尖峰時可額外開的連線數
    pool_pre_ping=True,    # 等同方案一的 ping=4：取連線前先檢測殭屍
    pool_recycle=1800,     # 連線存活 30 分鐘強制汰換，永遠碰不到 RDS 8 小時 wait_timeout
    pool_timeout=10,       # 取連線最多等 10 秒，逾時拋例外（取代 blocking=True 的永久等待）
    echo=False,
)

# expire_on_commit=False：commit 後物件仍可讀取，避免 async 下的 lazy-load 陷阱
AsyncSessionLocal = async_sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)


async def get_db():
    """FastAPI 依賴：提供 AsyncSession，並負責 commit / rollback / close。"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        # async with 結束時自動 close，不需手動寫
```

> UTC 時區設定建議用 event listener，在每條連線建立時自動 `SET time_zone='+00:00'`，取代原本的 `set_utc`。

### Step 2：改寫 `repositories/destination_repo.py`

```python
# 改造後示意（保留原 SQL 字串，只換執行方式）
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def get_existing_destinations(location: str, session: AsyncSession):
    sql_search = text("""
        SELECT id, input_region, city_name AS city, place_name AS attraction,
               description, geo_tags, google_place_id, lat, lng
        FROM destinations
        WHERE source = 'ai'
          AND (input_region = :loc OR geo_tags LIKE :pat OR city_name LIKE :pat)
    """)
    pattern = f"%{location}%"
    result = await session.execute(sql_search, {"loc": location, "pat": pattern})
    rows = result.mappings().all()   # 取代 cur.fetchall()，回傳 dict-like
    # ... 後續組裝邏輯不變
```

> 注意：raw SQL 的參數佔位符要從 PyMySQL 的 `%s` 改為 SQLAlchemy 的 `:name` 具名參數。

### Step 3：改寫 `core/dependencies.py`

- 三個函式 (`get_current_user`、`assert_trip_owner`、`get_optional_user`) 改 `async def`。
- 參數 `cur=Depends(get_cur)` → `db: AsyncSession = Depends(get_db)`。
- 內部 `cur.execute(...)` → `await db.execute(text(...), params)`，`cur.fetchone()` → `result.mappings().first()`。

### Step 4：逐一改寫 router（auth → search → trips → itinerary → share）

每個檔案的機械式改動：
1. route 函式 `def` → `async def`。
2. `cur=Depends(get_cur)` → `db: AsyncSession = Depends(get_db)`。
3. 所有 `cur.execute` → `await db.execute`，`fetchall/fetchone` → `result.mappings().all()/.first()`。
4. 直接呼叫 repository 的地方改成 `await repo_func(...)`。

> 建議**一個 router 改完就跑一次該模組的測試**，確認綠燈再改下一個，縮小除錯範圍。

### Step 5：處理 `redis_cache` 裝飾器

新增 async 版本：
```python
def async_redis_cache(cache_key: str, expire_seconds: int = 3600):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # 讀快取... 命中直接 return
            result_data = await func(*args, **kwargs)   # 關鍵：await
            # 寫快取...
            return result_data
        return wrapper
    return decorator
```

### Step 6：處理背景任務（Celery / BackgroundTasks）

**建議策略**：worker 端維持同步，但升級為帶健康管理的同步 engine。

```python
# worker 專用的同步 engine（與 FastAPI 的 async engine 分開）
from sqlalchemy import create_engine

sync_engine = create_engine(
    f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}?charset=utf8mb4",
    pool_size=2,
    pool_pre_ping=True,    # 同樣補上健康檢測
    pool_recycle=1800,
    pool_timeout=10,
)
```

> 這樣 Celery 維持它擅長的同步模型，又同樣享有 `pool_pre_ping` / `pool_recycle` 的保護，避免 async 與 Celery event loop 的整合陷阱。

### Step 7：改寫測試 `conftest.py`

1. 加入 `pytest-asyncio` 並設定 `asyncio_mode = auto`。
2. `client_with_db` 改用 `httpx.AsyncClient`。
3. `MockCursor` 改為 mock `AsyncSession`（`execute` 需為 `AsyncMock`，回傳物件需支援 `.mappings().all()`）。

### Step 8：整合驗證

- 全測試綠燈。
- 本地壓力測試：用 `ab` 或 `locust` 對 `/api/popular-searches` 打併發，對照改造前後的吞吐量。
- 部署到 staging，觀察至少超過一個「低流量夜晚 + 隔日早晨」週期，確認不再卡死。

---

## 五、風險與注意事項

| 風險 | 說明 | 緩解措施 |
|------|------|---------|
| **Celery 與 async 整合衝突** | Celery 5.x 對 async task 支援不完整，強行 async 容易出 event loop 錯誤 | worker 端維持同步 engine（Step 6） |
| **改動範圍大、容易遺漏** | 9 個檔案、多個 endpoint 都要改 | 一個 router 改完跑一次測試，漸進推進 |
| **raw SQL 佔位符差異** | PyMySQL 用 `%s`，SQLAlchemy 用 `:name` | 全域搜尋 `%s` 逐一替換並測試 |
| **`expire_on_commit` 陷阱** | async 下 commit 後存取 ORM 物件會觸發 lazy-load 而報錯 | `async_sessionmaker(expire_on_commit=False)` |
| **時區設定遺漏** | 忘記移植 `set_utc` 會導致 TIMESTAMP 語意改變 | 用 engine event listener 統一設定 |
| **transaction 語意改變** | 新 `get_db` 的 commit/rollback 時機需與舊版一致 | 仔細比對 Step 1 的 try/except 邏輯 |
| **驅動相依** | 忘了裝 `aiomysql` 會在啟動時報錯 | Step 0 先更新 requirements 並重 build image |

---

## 六、回滾策略

1. 整個改造在獨立 branch `refactor/async-db` 進行，主線不受影響。
2. 由於方案一已先行修復卡死問題，**即使 async 改造延後或失敗，正式環境也是安全的**。
3. 若改造後出現問題，直接切回方案一的 commit 即可，無資料遷移、無 schema 變更，回滾零成本。

---

## 七、驗收標準（Definition of Done）

- [ ] 所有既有測試在 async 架構下綠燈。
- [ ] `core/database.py` 使用 `create_async_engine`，且具備 `pool_pre_ping` / `pool_recycle` / `pool_timeout`。
- [ ] 所有 router endpoint 改為 `async def` 並使用 `Depends(get_db)`。
- [ ] Celery worker 使用獨立同步 engine，同樣具備健康管理參數。
- [ ] `/health` 在 async 架構下仍能正確偵測 DB 並回 503。
- [ ] staging 環境通過一個完整「低流量夜晚→隔日早晨」週期無卡死。
- [ ] 壓測數據顯示併發吞吐量較改造前提升（驗證 async 的實質效益）。

---

## 附錄：方案一 ↔ 方案三 對照速查

| 防線目的 | 方案一（DBUtils，已採用） | 方案三（SQLAlchemy Async，本計畫） |
|---------|--------------------------|-----------------------------------|
| 偵測殭屍連線 | `ping=4` | `pool_pre_ping=True` |
| 連線不過老 | （無，靠 ping 被動偵測） | `pool_recycle=1800` |
| 取連線不無限等待 | （無，`blocking=True` 永久等） | `pool_timeout=10` |
| 容器自我修復 | `/health` + `SELECT 1` + 503 | `/health` + `SELECT 1` + 503（沿用） |
| 併發吞吐提升 | ❌ 仍為同步阻塞 | ✅ 全面 async |
