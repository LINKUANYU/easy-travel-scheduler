# easy-travel-scheduler 部署架構改造計畫

> 將舊有「EC2 上 build + 雙機部署」架構，改造為「GitHub Actions build → GHCR → 單台 EC2 pull & run」的標準 CI/CD 流程。

---

## 一、改造背景與痛點

### 舊架構痛點

1. **EC2 build image 容易 OOM**：小型 EC2(t3.small 等級)記憶體不足以同時跑服務並 build 帶有 pandas/lxml 等需編譯套件的 Python image。
2. **Web 與 Worker 分兩台 EC2**：當初為了避免 build 互相干擾而拆分,但這只是「症狀治療」,根因是 build 不該在正式環境機器上做。
3. **沒有 image 版本管理**:每次部署都從 git pull 重 build,無法快速 rollback。

### 改造方向

- **Build / Run 分離**:用 GitHub Actions 負責 build,EC2 只負責 pull + run。
- **單台 EC2 整合**:Web 跟 Worker 跑在同一台,用 docker-compose 統一管理。
- **GHCR 作為 image registry**:免費、與 GitHub 整合好、支援 private。

---

## 二、決策總結

### 2.1 部署架構決策

| 項目 | 舊架構 | 新架構 |
|------|--------|--------|
| EC2 機器數 | 2 台(Web + Worker) | **1 台(合併)** |
| Build 位置 | EC2 上 `docker build` | **GitHub Actions runner** |
| Image 存放 | 沒有,每次重 build | **GHCR Private** |
| EC2 的工作 | git pull + build + run | **只 pull + run** |
| Image Tagging | 無 | **Git Commit SHA + `latest` 雙 tag** |
| Backend / Worker | 兩個獨立服務 | **同一個 image,不同 command** |
| 本地資料庫 | 未明確 | **MySQL container(不連 RDS)** |

### 2.2 Docker Compose 拆分

採用 **三檔分層架構**:

| 檔案 | 職責 | 何時使用 |
|------|------|---------|
| `docker-compose.yml` | 共用基底(service 名稱、network、command、depends_on) | 永遠載入 |
| `docker-compose.dev.yml` | 本地開發 override(build、volumes、ports、debug env) | 本地開發時疊上 |
| `docker-compose.prod.yml` | 正式環境 override(image from GHCR、restart、resource limits) | EC2 部署時疊上 |

合併規則:後面的檔案會「覆蓋」或「補充」前面的設定。

```bash
# 本地
docker compose -f docker-compose.yml -f docker-compose.dev.yml up

# 正式(EC2)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### 2.3 服務拓樸

**本地開發環境(Mac)**:

```
backend (FastAPI)  ──┐
worker (Celery)    ──┼──> redis (container)
                     │
                     └──> mysql (container)
```

**正式環境(單台 EC2)**:

```
                  ┌─> backend (FastAPI) ─┐
nginx (對外 80/443)                       ├─> redis (container)
                  └─> worker (Celery) ───┘
                                          └─> AWS RDS (MySQL)
                                          └─> AWS SQS
```

### 2.4 關鍵設計理由

#### 為什麼 Backend 與 Worker 用同一個 image?

- **本質上是同一個應用程式的不同啟動方式**:共用 Python 版本、`requirements.txt`、程式碼、settings。
- **避免版本漂移**:兩個 image 容易出現 schema 不同步問題。
- **CI/CD 時間減半**:build / push / pull 各一次即可。
- 差別只在 `command`:一個跑 uvicorn、一個跑 celery。

#### 為什麼本地不直連 AWS RDS?

| 風險 | 說明 |
|------|------|
| 誤刪正式資料 | debug 時可能誤下 `DELETE` |
| Security Group 開太大 | IP 常變,容易變成 `0.0.0.0/0` 全開 |
| 測試污染正式資料 | 跑單元/整合測試會動到正式 DB |
| 網路延遲 | 每個 query +30ms |

**業界鐵則**:本地開發環境永遠不要直連正式資料庫。

#### 為什麼用 GHCR Private 而不是 Public?

- 程式碼 repo 公開 ≠ image 必須公開,兩者可獨立設定。
- Private 多一層保險,避免 image 內殘留 secret 被外人取得。
- GHCR 對個人帳號的 private package 免費額度大方。

---

## 三、整體流程

### 階段 A:Code 變更 → Image 進 GHCR

```
你在 Mac 寫 code
      ↓
git push origin main
      ↓
[GitHub Actions 自動觸發]
      ↓
  1. checkout 程式碼
  2. 登入 GHCR
  3. docker build → 產生 image
  4. docker push → 推到 GHCR private
      ↓
GHCR 上多了一個新版本(SHA tag + latest tag)
```

### 階段 B:把新 image 部署到 EC2

```
[GitHub Actions 接續執行 deploy job]
      ↓
  SSH 進 EC2
      ↓
  在 EC2 上執行:
    1. docker compose pull(拉新 image)
    2. docker compose up -d(用新 image 啟動)
    3. docker image prune(清掉舊 image 省空間)
      ↓
EC2 跑著新版本
```

### 階段 C:本地開發(完全獨立,不受影響)

```
你在 Mac 改 code
      ↓
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
      ↓
本地 build 出 image,跑起來測試
(完全不碰 GHCR,也不影響正式環境)
```

---

## 四、實作待辦清單

### 階段 1:本地環境改造(不影響正式環境)

> 目標:把本地開發環境的 docker-compose 拆好,確認本地能正常跑起來。

- [x] **Task 1.1**:補強 `.dockerignore`,排除 `.env.*`、`__pycache__`、`.git`、`.pytest_cache/` 等。
- [x] **Task 1.2**:拆分 docker-compose 為三個檔案(yml / dev / prod)。
- [x] **Task 1.3**:本地新增 MySQL 8.0 service,掛載 `backend/db/schema.sql` 自動建表。
- [x] **Task 1.4**:環境變數整理,建立 `.env.dev`(本地)與各 `.example` 範本進 repo。
- [x] **Task 1.5**:驗收 - 本地 `docker compose up --build` 能正常啟動。

### 階段 2:Dockerfile 優化

> 目標:讓 image build 更快、更小,能在 GitHub Actions 上順利 build。

- [x] **Task 2.1**:改寫成 Multi-stage Build(builder + runtime)。
- [x] **Task 2.2**:優化 Layer Cache 順序(先 COPY requirements.txt 再 COPY 程式碼)。
- [x] **Task 2.3**:本地 build 測試,確認 image 大小合理(< 500MB)。

### 階段 3:GHCR 設定

> 目標:準備好 image registry,能手動推第一個 image 上去測試。

- [ ] **Task 3.1**:建立 GitHub Personal Access Token (PAT),範圍 `write:packages`、`read:packages`、`delete:packages`。
- [ ] **Task 3.2**:Mac 上手動測試 `docker login ghcr.io` → `build` → `push` 完整流程。
- [ ] **Task 3.3**:確認 GHCR 上 image 為 Private 狀態。

### 階段 4:EC2 環境準備

> 目標:把 EC2 改造成「只 pull + run」的角色。

- [ ] **Task 4.1**:備份資料、停掉舊服務、清空 EC2 上的 git clone 資料夾。
- [ ] **Task 4.2**:EC2 上 `docker login ghcr.io`,認證寫入 `~/.docker/config.json`。
- [ ] **Task 4.3**:EC2 上只放 `docker-compose.yml`、`docker-compose.prod.yml`、`.env.prod`(不需要原始碼)。
- [ ] **Task 4.4**:EC2 手動 `docker compose pull` + `up -d` 測試。
- [ ] **Task 4.5**:EC2 規格評估,必要時升級至 t3.medium。
- [ ] **Task 4.6**:確認新架構穩定後,停止並終止舊的 Worker EC2 instance。

### 階段 5:GitHub Actions 自動化

> 目標:完成完整 CI/CD,push code 後自動部署。

- [ ] **Task 5.1**:GitHub repo 新增 Secrets:`EC2_HOST`、`EC2_USER`、`EC2_SSH_KEY`、`GHCR_PAT`。
- [ ] **Task 5.2**:建立 `.github/workflows/deploy.yml`,包含 build-and-push 與 deploy 兩個 job。
- [ ] **Task 5.3**:測試完整流程 - push 一個小修改,觀察整個 CI/CD 是否成功。

### 階段 6:補強(可選但建議)

- [ ] **Task 6.1**:加上 healthcheck,確認服務真的活著。
- [ ] **Task 6.2**:設定 docker log rotation,避免磁碟被撐爆。
- [ ] **Task 6.3**:寫 rollback 腳本,能快速回到指定 SHA 版本。

---

## 五、實作順序與風險提示

```
階段 1(本地拆分)→ 不影響線上
    ↓
階段 2(Dockerfile)→ 不影響線上
    ↓
階段 3(GHCR 手動測試)→ 不影響線上
    ↓
階段 4(EC2 改造)→ ⚠️ 開始影響線上
    ↓
階段 5(CI/CD 自動化)→ 影響後續部署流程
    ↓
階段 6(補強)→ 可獨立進行
```

### 階段 4 前的安全清單

階段 4 開始會影響線上服務,執行前務必:

1. ✅ 選擇低流量時段(深夜或週末)
2. ✅ AWS Console snapshot 現有 EC2 instance
3. ✅ 備份 RDS 資料
4. ✅ 準備 rollback 計畫(舊 EC2 不要立刻關掉)

---

## 六、設計骨架參考

### `docker-compose.yml`(基底)

```yaml
services:
  backend:
    # 注意:這裡沒有 build 也沒有 image,由 dev/prod 各自補
    command: uvicorn main:app --host 0.0.0.0 --port 8000
    depends_on:
      - redis
    networks:
      - app-network

  worker:
    command: celery -A worker.celery_app worker --loglevel=info
    depends_on:
      - redis
    networks:
      - app-network

  redis:
    image: redis:7-alpine
    networks:
      - app-network

networks:
  app-network:
    driver: bridge
```

### `docker-compose.dev.yml`(本地)

```yaml
services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    image: easy-travel-backend:dev  # build 完打這個 tag,讓 worker 共用
    volumes:
      - ./backend:/app              # hot reload
    ports:
      - "8000:8000"
    env_file:
      - .env.dev

  worker:
    image: easy-travel-backend:dev  # 共用 backend build 出來的 image
    volumes:
      - ./backend:/app
    env_file:
      - .env.dev
    # Celery 沒有 auto reload,改 code 後請 docker compose restart worker

  redis:
    ports:
      - "6379:6379"

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: localdev
      MYSQL_DATABASE: easy_travel
    ports:
      - "3306:3306"
    volumes:
      - mysql_data:/var/lib/mysql
      - ./scripts/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    networks:
      - app-network

volumes:
  mysql_data:
```

### `docker-compose.prod.yml`(EC2)

```yaml
services:
  backend:
    image: ghcr.io/<你的帳號>/easy-travel-backend:latest
    restart: always
    env_file:
      - .env.prod
    deploy:
      resources:
        limits:
          memory: 768M
          cpus: '0.75'

  worker:
    image: ghcr.io/<你的帳號>/easy-travel-backend:latest  # 同一個 image
    restart: always
    env_file:
      - .env.prod
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'

  redis:
    restart: always
    # 不對外開 port,只在 container 內部使用

  nginx:
    image: nginx:alpine
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - backend
    networks:
      - app-network
```

---

## 七、待後續討論的項目

實作時可能會遇到、本次未深入討論的細節:

1. **Nginx 設定檔具體內容**(reverse proxy 規則、HTTPS 設定)
2. **Cloudflare 跟 EC2 之間是 HTTP 還是 HTTPS**
3. **Next.js 前端 CI/CD 流程**(建議同步改造)
4. **資料庫 migration 工具**(Alembic 或手動)
5. **Celery concurrency 設定**(worker 數量、prefetch_multiplier)
6. **Worker 本地是否要用 watchmedo 做 auto reload**(目前選擇手動重啟)
7. **藍綠部署 / 零停機部署**(未來進階)

---

## 八、常見錯誤備忘錄

實作時請特別留意以下陷阱:

| 錯誤 | 後果 |
|------|------|
| `build:` 寫在基底 `docker-compose.yml` | EC2 也會嘗試 build,改造失效 |
| dev 跟 prod 的 service 名稱不一致 | override 合併失敗 |
| `.env` 沒被 `.dockerignore` 排除 | secret 被打進 image |
| 用 `ARG GEMINI_API_KEY` 傳 secret | secret 永久留在 image layer history |
| `image` tag 只用 `latest` | 無法 rollback,舊版本被覆蓋 |
| 本地 volume mount 蓋掉 container 裡的 `node_modules` | 啟動失敗 |
| Celery 改 code 不重啟 | 跑的還是舊邏輯,debug 半天找不到原因 |

---

## 九、階段 1 實作紀錄

> 執行日期：2026-05-22

### 完成項目

| 檔案 | 異動類型 | 說明 |
|------|----------|------|
| `backend/.dockerignore` | 補強 | 新增 `.env.*`、`.git/`、`.pytest_cache/`、`.ruff_cache/`、`.DS_Store` 等排除規則 |
| `frontend/.dockerignore` | 修正 | 取消 `.env.local` 的危險註解（原本被 `#` 註解掉，secret 會進入 image）|
| `docker-compose.yml` | 重構 | 純基底，移除所有 `build:` 與 `image:`，新增 healthcheck 確保啟動順序正確 |
| `docker-compose.dev.yml` | 新增 | 本地環境 override，含 MySQL container、build args、volumes |
| `docker-compose.prod.yml` | 新增 | EC2 環境 override，image 從 GHCR 拉取，含 resource limits |
| `backend/.env.dev` | 新增 | 從舊 `.env` 遷移，`DB_HOST` 改為 `mysql`（指向 container） |
| `backend/.env.dev.example` | 新增 | 放進 repo 的本地環境變數範本 |
| `backend/.env.prod.example` | 新增 | 放進 repo 的正式環境變數範本 |
| `frontend/.env.local.example` | 新增 | 前端本地環境變數範本 |
| `frontend/.env.prod.example` | 新增 | 前端正式環境變數範本 |
| `.env`（根目錄）| 新增 | 供 docker compose build args 使用，存放需在 build 時期傳入的變數 |
| `.gitignore` | 補強 | 新增 `backend/.env.*`、`frontend/.env.*` 排除規則 |
| `backend/Dockerfile` | 修改 | 新增安裝 `curl`（供 healthcheck 使用） |
| `backend/main.py` | 新增 | 加入 `GET /health` endpoint，供 docker healthcheck 輕量探測 |
| `frontend/Dockerfile` | 修改 | 新增 `ARG` / `ENV` 接收 `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`，確保 build 時期燒入 bundle |

### 遇到的錯誤與解法

**錯誤 1：3306 port 被佔用**

```
Error: ports are not available: exposing port TCP 0.0.0.0:3306 -> 127.0.0.1:0:
listen tcp 0.0.0.0:3306: bind: address already in use
```

- **原因**：Mac 本機有 MySQL 以系統服務（`launchctl`）方式執行，不是透過 Homebrew 管理，`brew services stop mysql` 無效。
- **查法**：`sudo lsof -i :3306` 找到佔用的 process（`mysqld`，user 為 `_mysql`）。
- **解法**：`sudo launchctl stop com.oracle.oss.mysql.mysqld`

---

**錯誤 2：地圖沒有顯示（`Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`）**

```
Uncaught (in promise) Error: Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
```

- **原因**：`NEXT_PUBLIC_*` 開頭的變數是 Next.js 的 build time 變數，在 `npm run build` 時就會燒進 JS bundle，純靠 `env_file` 是 runtime 才讀取的，無法傳進 build 階段。
- **解法**：
  1. 在根目錄建立 `.env`，讓 docker compose 自動載入作為 build args 來源。
  2. 在 `docker-compose.dev.yml` 的 `build.args` 明確傳入。
  3. 在 `frontend/Dockerfile` 用 `ARG` + `ENV` 接收，在 `RUN npm run build` 之前設好。
- **教訓**：Next.js 的環境變數有兩種，要分清楚：
  - `NEXT_PUBLIC_*`：build time，需透過 build args 傳入 Dockerfile
  - 其他變數（如 `API_BASE_URL`）：runtime，`env_file` 就夠了

---

**錯誤 3：後端 build 完不會自動啟動，需要手動在 Docker Desktop 點啟動**

- **原因**：`depends_on` 預設只等 container **啟動**（`service_started`），不等服務**真正 ready**。backend 啟動需要幾秒，其他服務太早啟動就會失敗並 exit。
- **解法**：
  1. 在 `docker-compose.yml` 為 `redis` 和 `backend` 加上 `healthcheck`。
  2. 將 `depends_on` 改為 `condition: service_healthy`，確保前一個服務真正健康才繼續。
  3. 在 `backend/main.py` 新增 `GET /health` endpoint（輕量，只回傳 `{"status": "ok"}`）。
  4. 在 `backend/Dockerfile` 安裝 `curl`，供 healthcheck 的 `CMD` 使用。
- **啟動順序**：`redis (healthy)` → `backend (healthy)` → `frontend`、`worker`、`nginx`

---

## 十、階段 2 實作紀錄

> 執行日期：2026-05-25

### 完成項目

| 檔案 | 異動類型 | 說明 |
|------|----------|------|
| `backend/Dockerfile` | 重寫 | 改為 Multi-stage Build（builder + runtime），使用 venv 管理套件與 CLI 執行檔 |

### 架構說明

**Stage 1（builder）**：
- 安裝編譯工具（`gcc`、`default-libmysqlclient-dev`）
- 建立 Python venv 於 `/venv`
- `COPY requirements.txt` → `pip install`（利用 Layer Cache，依賴未變則跳過）

**Stage 2（runtime）**：
- 僅安裝 runtime 動態庫（`libmariadb3`、`curl`）
- `COPY --from=builder /venv /venv`（整包帶走，含套件本體與 CLI 執行檔）
- `COPY . .` 複製程式碼
- `ENV PATH="/venv/bin:$PATH"` 讓 shell 能找到 `celery`、`uvicorn` 等指令

**Layer Cache 順序**（由上到下，越上面越少改動）：

```
apt-get install（幾乎不變）
COPY requirements.txt + pip install（依賴變才重跑）
COPY . .（程式碼改動最頻繁，放最後）
```

### Image 大小分析

| | 大小 | 說明 |
|---|---|---|
| 最終 image | 562MB | 略超 500MB 目標，但原因合理 |
| `botocore`（AWS SDK）| 29MB | 業務必要，接 SQS 用 |
| `sqlalchemy`（ORM）| 21MB | 業務必要 |
| `pycurl.libs` + `lxml`（爬蟲）| 27MB | 業務必要 |

**結論**：超標原因是依賴本身就重，不是 Dockerfile 寫法問題。Multi-stage 已移除 `gcc`、`libmysqlclient-dev` 等編譯工具，效果已發揮。

### 遇到的錯誤與解法

**錯誤：Worker 啟動失敗（`celery` executable not found）**

```
Error response from daemon: failed to create task for container: failed to create shim task:
OCI runtime create failed: runc create failed: unable to start container process:
error during container init: exec: "celery": executable file not found in $PATH
```

- **原因**：第一版使用 `pip install --target=/install`，Stage 2 只 COPY 了套件本體到 `site-packages/`，但 `celery`、`uvicorn` 等 CLI 執行檔是放在 `/install/bin/` 裡，沒有一起被複製，也沒有加入 `$PATH`，導致找不到指令。
- **解法**：改用 **Python venv** 替代 `--target`。

| | `pip install --target` | `python -m venv` |
|---|---|---|
| 套件本體（site-packages/）| ✅ 複製到 | ✅ 包含於 /venv |
| CLI 執行檔（bin/celery 等）| ❌ 遺漏，需額外處理 | ✅ 一起包含於 /venv/bin |
| Stage 2 複製語法 | 需兩行 COPY（site-packages + bin）| 一行 `COPY --from=builder /venv /venv` |

- **教訓**：`pip install --target` 只適合「只需要 import 套件」的情境。只要套件有提供 CLI 工具（如 `celery`、`uvicorn`、`alembic`），就必須讓 `bin/` 目錄也進入 `$PATH`，用 venv 是最乾淨的做法。
