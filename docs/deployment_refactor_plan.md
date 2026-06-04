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

- [x] **Task 3.1**:建立 GitHub Personal Access Token (PAT),範圍 `write:packages`、`read:packages`、`delete:packages`。
- [x] **Task 3.2**:Mac 上手動測試 `docker login ghcr.io` → `build` → `push` 完整流程。
- [x] **Task 3.3**:確認 GHCR 上 image 為 Private 狀態。

### 階段 4:EC2 環境準備

> 目標:把 EC2 改造成「只 pull + run」的角色。

- [x] **Task 4.1**:備份資料、停掉舊服務、清空 EC2 上的 git clone 資料夾。
- [x] **Task 4.2**:EC2 上 `docker login ghcr.io`,認證寫入 `~/.docker/config.json`。
- [x] **Task 4.3**:EC2 上只放 `docker-compose.yml`、`docker-compose.prod.yml`、`.env.prod`(不需要原始碼)。
- [x] **Task 4.4**:EC2 手動 `docker compose pull` + `up -d` 測試。
- [x] **Task 4.5**:EC2 規格評估,必要時升級至 t3.medium。
- [x] **Task 4.6**:確認新架構穩定後，停止舊的 Worker EC2 instance（已 Stop，待觀察後 Terminate）。

### 階段 5:GitHub Actions 自動化

> 目標:完成完整 CI/CD,push code 後自動部署。

- [x] **Task 5.1**:GitHub repo 新增 Secrets：`EC2_HOST`、`EC2_USER`、`EC2_SSH_KEY`、`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`（改用內建 `GITHUB_TOKEN` 推 GHCR，不再需要 `GHCR_PAT`）。
- [x] **Task 5.2**:改寫 `.github/workflows/deploy.yml`，包含 `build-and-push` 與 `deploy` 兩個 job，加入 `workflow_dispatch` 手動觸發。
- [x] **Task 5.3**:測試完整流程 - push 後 frontend、backend、worker 全部在 EC2 成功重啟。


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

---

## 十一、階段 3 實作紀錄

> 執行日期：2026-05-25

### 完成項目

| 項目 | 說明 |
|------|------|
| GitHub PAT 建立 | Classic token，勾選 `write:packages`（自動含 `read:packages`、`delete:packages`），有效期限 90 天 |
| `docker login ghcr.io` | 使用 `echo "PAT" \| docker login ghcr.io -u linkuanyu --password-stdin` 成功登入 |
| Image 打標籤 | `docker tag easy-travel-backend:dev ghcr.io/linkuanyu/easy-travel-backend:latest` |
| Image 打 SHA tag | `docker tag easy-travel-backend:dev ghcr.io/linkuanyu/easy-travel-backend:<git-sha>` |
| `docker push` | `latest` 與 SHA tag 兩個 tag 均成功推送到 GHCR |
| Private 狀態確認 | GHCR 上的 `easy-travel-backend` package 原本已是 Private，無需額外調整 |

### 備忘：後續 CI/CD 使用的 image 路徑

```
ghcr.io/linkuanyu/easy-travel-backend:latest
ghcr.io/linkuanyu/easy-travel-backend:<git-commit-sha>
```

階段 5 的 `docker-compose.prod.yml` 與 GitHub Actions workflow 將使用此路徑。

### 注意事項

| 項目 | 說明 |
|------|------|
| PAT 只顯示一次 | 建立後請存入密碼管理器，遺失須重新產生 |
| PAT 有效期限 | 90 天後需重新產生並更新 GitHub Secret（`GHCR_PAT`） |
| image 帳號需全小寫 | GHCR 路徑中帳號必須全小寫：`linkuanyu`，不可用 `LINKUANYU` |
| `--password-stdin` 防止 token 留在 shell 歷史 | 避免直接用 `-p YOUR_PAT` 造成 token 洩漏 |

---

## 十二、階段 4 實作紀錄

> 執行日期：2026-05-25

### 完成項目

| 項目 | 說明 |
|------|------|
| EBS Snapshot 備份 | Snapshot ID：`snap-0631d273ec52f4607`，備份 Web EC2 磁碟 |
| GitHub Secrets 更新 | 新增 `GHCR_PAT`、`USERNAME`（注意：GitHub 不允許 `GITHUB_` 開頭的 Secret 名稱）、`EC2_USER` |
| 舊服務停止 | `docker compose down` 停掉 frontend、backend、nginx、redis 共 4 個 container |
| `.env.production` 重新命名 | `backend/.env.production` → `backend/.env.prod`；`frontend/.env.production` → `frontend/.env.prod` |
| compose 檔更新 | 用 `scp` 把本地新版 `docker-compose.yml`、`docker-compose.prod.yml` 推到 EC2，覆蓋舊版單檔架構 |
| EC2 原始碼清除 | 刪除 `backend/`、`frontend/` 原始碼（保留 `.env.prod`），釋出約 900MB 磁碟空間 |
| `USERNAME` 環境變數設定 | `echo 'export USERNAME=linkuanyu' >> ~/.bashrc`，供 compose 組合 GHCR image 路徑用 |
| EC2 登入 GHCR | `echo "PAT" \| docker login ghcr.io -u linkuanyu --password-stdin`，認證寫入 `~/.docker/config.json` |
| Frontend image 補推 GHCR | 階段 3 只推了 backend，階段 4 補推 `easy-travel-frontend:latest` 與 SHA tag |
| 手動 pull + up -d | 5 個服務（backend、worker、frontend、nginx、redis）全部成功啟動 |
| Nginx `/health` 路由修正 | 新增 `location /health` 路由到 backend，避免被前端攔截 |
| EC2 規格評估 | t3.small（1GB RAM），目前使用約 300MB（33%），暫不需升級 |

### 遇到的錯誤與解法

**錯誤 1：`manifest unknown`（frontend image 不存在）**

```
✘ frontend Error  manifest unknown
```

- **原因**：階段 3 只手動推了 `easy-travel-backend`，`easy-travel-frontend` 從來沒推過 GHCR。
- **解法**：在 Mac 本地 build frontend image 並推到 GHCR。

---

**錯誤 2：`no matching manifest for linux/amd64`**

```
no matching manifest for linux/amd64 in the manifest list entries
```

- **原因**：Mac M 系列晶片預設 build 出 `linux/arm64` 架構的 image，但 EC2（t3 系列）是 `linux/amd64` 架構，兩者不相容。
- **解法**：build 時加上 `--platform linux/amd64` 強制指定目標架構。

```bash
docker build --platform linux/amd64 -t ghcr.io/linkuanyu/easy-travel-backend:latest ./backend
docker build --platform linux/amd64 -t ghcr.io/linkuanyu/easy-travel-frontend:latest ./frontend
```

- **教訓**：這也是為什麼 **階段 5 要改用 GitHub Actions build** 的根本原因之一——Actions runner 本身就是 `linux/amd64`，不需要跨平台模擬，速度快且架構正確。

---

**錯誤 3：`no space left on device`（磁碟空間不足）**

```
failed to register layer: no space left on device
```

- **原因**：EC2 磁碟（15GB）已使用 14GB（94%），舊的 Docker image 佔了 2.585GB 仍留在磁碟。
- **解法**：
  1. `docker image prune -a -f` 清掉所有未使用 image，釋出 498MB。
  2. 刪除 EC2 上的原始碼目錄（`backend/`、`frontend/` 程式碼），新架構不需要 source code，釋出約 900MB。

---

**錯誤 4：`curl http://localhost/health` 回傳前端 HTML**

- **原因**：`/health` 不在 `/api/` 前綴下，nginx 的 `location /` 會攔截所有非 `/api/` 的請求並導到前端，前端沒有 `/health` 路由所以回 404 HTML。
- **解法**：在 `nginx/default.conf` 新增 `location /health` 明確路由到 backend，擺在 `location /` 之前（nginx 優先匹配更精確的路徑）。

---

**錯誤 5：`USERNAME` Secret 命名限制**

- **原因**：GitHub 不允許 `GITHUB_` 開頭的 Secret 名稱（系統保留字）。
- **解法**：將 `GITHUB_USERNAME` 改名為 `USERNAME`，`docker-compose.prod.yml` 裡對應改為 `${USERNAME}`，EC2 的 `~/.bashrc` 也改為 `export USERNAME=linkuanyu`。

### EC2 資源使用快照（啟動後）

| Container | 記憶體使用 | 上限 | 使用率 |
|-----------|-----------|------|--------|
| backend | 94.9 MB | 768 MB | 12% |
| worker | 100.9 MB | 1024 MB | 11% |
| frontend | 92.9 MB | 512 MB | 18% |
| redis | 3.0 MB | 911 MB | 0.3% |
| nginx | 7.9 MB | 911 MB | 0.9% |
| **合計** | **~300 MB** | **911 MB（EC2 總量）** | **33%** |

**結論**：t3.small 目前夠用。建議當記憶體持續超過 80%（730 MB）時再升級至 t3.medium。

---

## 十三、階段 4.6 + 階段 5 實作紀錄

> 執行日期：2026-05-26

### 完成項目

| 項目 | 說明 |
|------|------|
| 舊 Worker EC2 Stop | 新架構穩定後已 Stop，確認無異常後再 Terminate |
| GitHub Secret 新增 | 新增 `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`，供 frontend build time 使用 |
| `deploy.yml` 完整改寫 | 舊版「EC2 上 git pull + build」→ 新版「Actions build → push GHCR → EC2 pull + run」 |
| GHCR 認證改用 `GITHUB_TOKEN` | 取代 PAT，不會過期，Actions runner 天生擁有推送自己 repo packages 的權限 |
| GHCR package 連結 repo | 在 GHCR package settings → Manage Actions access 加入 repo，權限設為 Write（backend + frontend 各一次）|
| `docker-compose.prod.yml` 帳號寫死 | 將 `${USERNAME}` 改為 `linkuanyu`，避免 non-interactive shell 不載入 `~/.bashrc` 導致變數為空 |
| deploy job 新增 scp 同步 | 每次部署前用 `appleboy/scp-action` 把最新 compose 檔推到 EC2，確保設定與 repo 同步 |
| deploy 清理順序調整 | 改為 pull **之前**先執行 `docker system prune -a -f`，避免磁碟不足導致 pull 失敗 |
| 完整流程驗證 | push 後 frontend、backend、worker 全部在 EC2 成功 Recreate 並重啟 ✅ |

### 遇到的錯誤與解法

**錯誤 1：`repository name must be lowercase`**

```
ERROR: failed to build: invalid tag "ghcr.io/LINKUANYU/easy-travel-backend:latest":
repository name must be lowercase
```

- **原因**：`github.repository_owner` 會保留 GitHub 帳號原始大小寫（`LINKUANYU`），GHCR 路徑規定必須全小寫。
- **解法**：新增 step 用 `tr '[:upper:]' '[:lower:]'` 轉小寫，寫入 `$GITHUB_OUTPUT`，後續 step 用 `${{ steps.owner.outputs.value }}` 取用。

---

**錯誤 2：GHCR push 403 Forbidden**

```
unexpected status from HEAD request to https://ghcr.io/v2/linkuanyu/easy-travel-backend/blobs/...: 403 Forbidden
```

- **原因**：`GITHUB_TOKEN` 推送 GHCR Private package 需要兩個條件同時成立：（1）workflow 頂層宣告 `permissions: packages: write`、（2）在 GHCR package settings 把 repo 加入 Manage Actions access。
- **解法**：
  1. `deploy.yml` 頂層新增 `permissions: contents: read / packages: write`。
  2. 前往 `github.com/users/linkuanyu/packages/container/<package>/settings`，在「Manage Actions access」加入 repo，權限設為 Write。

---

**錯誤 3：`USERNAME` 變數為空（`invalid reference format`）**

```
The "USERNAME" variable is not set. Defaulting to a blank string.
invalid reference format
```

- **原因**：EC2 `~/.bashrc` 裡的 `export USERNAME=linkuanyu` 只在 interactive shell 載入，GitHub Actions 用 SSH 執行指令時是 non-interactive shell，`~/.bashrc` 不會被執行。
- **解法**：`docker-compose.prod.yml` 直接把帳號寫死為 `linkuanyu`，不依賴環境變數。帳號名稱本身是公開資訊，無安全疑慮。
- **附帶改進**：deploy job 新增 `scp-action` step，每次部署前自動把最新 compose 檔同步到 EC2，避免手動維護版本落差。

---

**錯誤 4：`no space left on device`（磁碟空間不足，發生兩次）**

```
failed to register layer: ... no space left on device
```

- **第一次原因**：EC2 磁碟 15GB 已使用 93%，舊架構在 EC2 上 `docker build` 留下 **1.7GB Build Cache**，`docker image prune` 清不到（它只清 image，不清 build cache）。
- **診斷指令**：
  ```bash
  df -h               # 看硬碟剩餘空間
  docker system df    # 看 Docker 各類資源佔用，找出可回收空間
  ```
- **解法**：
  1. 手動執行 `docker builder prune -a -f` 清掉 1.7GB build cache。
  2. deploy script 改用 `docker system prune -a -f`（涵蓋 image + build cache + 停止的 container），且移到 pull **之前**執行。

| 指令 | 清掉什麼 |
|------|---------|
| `docker image prune -a -f` | 未被使用的 image |
| `docker builder prune -a -f` | Build cache |
| `docker system prune -a -f` | 以上全部 + 停止的 container + 未使用的 network |

### 最終 `deploy.yml` 架構

```
build-and-push job（GitHub Actions runner）
  ├── Checkout code
  ├── Set lowercase owner（避免 GHCR 大小寫錯誤）
  ├── Set up Docker Buildx
  ├── Log in to GHCR（GITHUB_TOKEN，不需 PAT）
  ├── Build + Push backend image（linux/amd64，含 layer cache）
  └── Build + Push frontend image（linux/amd64，傳入 Maps API Key build-arg）

deploy job（depends-on: build-and-push）
  ├── Checkout code
  ├── Sync compose files to EC2（scp，確保設定與 repo 同步）
  └── SSH 進 EC2
        ├── docker system prune -a -f（先清空間）
        ├── docker compose pull（拉新 image）
        └── docker compose up -d（重啟服務）
```
