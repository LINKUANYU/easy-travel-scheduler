# Claude Code 實作 Prompt

> 把以下整段內容貼到 Claude Code(VS Code Extension)的對話框,讓它依照階段協助實作。

---

## 任務目標

改造 easy-travel-scheduler 專案的部署架構,從「EC2 上 build + 雙機部署」改為「GitHub Actions build → GHCR private → 單台 EC2 pull & run」的標準 CI/CD 流程。

---

## 執行前提(每階段執行前必讀)

本專案已有部分基礎建設,請在執行每個階段前**先探勘現況**,避免重複建立或覆蓋既有成果。

### 探勘流程(每階段開始前必做)

1. **列出相關檔案是否存在**:使用 `ls` / `find` 檢查該階段要建立/修改的檔案是否已存在。
2. **讀取既有檔案內容**:若檔案已存在,先 `cat` 讀完內容,判斷是否已符合本次需求。
3. **產出「現況報告」給我確認**:以條列方式回報以下三類項目:
   - ✅ **已完成且符合需求**:直接跳過,不要重做。
   - ⚠️ **已存在但需調整**:列出與目標的差異,等我確認後再改。
   - ❌ **尚未建立**:說明將要建立什麼,等我確認後再執行。
4. **等我回覆「OK 請執行」之後才動手**,不要直接覆寫或新增檔案。

### 已知既有進度(請以實際 ls / cat 結果為準)

- ✅ **舊版 `docker-compose.yml` 已存在**:需重構為三檔架構(base + dev + prod)。
- ✅ **`backend/Dockerfile` 已存在**:還未改為 multi-stage,需重寫。
- ✅ **Nginx 設定檔已存在**:請讀取後評估是否需配合新架構調整。
- ✅ **`.dockerignore` 已存在**:請讀取現有內容,評估是否需要補強(尤其是 `.env`、`.env.*` 排除)。
- ❌ **本地 MySQL 目前是裝在 Mac 本機,不在 compose 裡**:本次要改成放進 `docker-compose.dev.yml` 的 container。
- ❌ **`.github/workflows/` 尚未建立**。
- ❌ **GHCR 尚未設定**。
- ❌ **`.env.dev` / `.env.prod` 尚未明確分離**。

> 注意:此清單若與實際 repo 不符,**請以 `ls` / `cat` 的實際結果為準**,並在現況報告中指正我。

### 禁止事項

- ❌ 禁止直接覆蓋既有檔案,除非我明確同意。
- ❌ 禁止重建已存在且符合需求的服務或設定。
- ❌ 禁止假設「沒看到就是沒做」,務必透過 `ls` / `find` / `cat` 實際確認。
- ❌ 禁止連續執行多個階段,每階段完成後必須等我驗收。

---

## 技術環境

- **語言**:Python 3.10 / TypeScript
- **框架**:FastAPI / Next.js / Celery
- **資料庫**:AWS RDS (MySQL) / Redis
- **基礎設施**:Docker / Nginx / AWS EC2 / AWS SQS / Cloudflare
- **CI/CD**:GitHub Actions + GHCR (GitHub Container Registry)
- **開發環境**:Mac + VS Code
- **正式環境**:單台 AWS EC2 (Ubuntu)

## 改造背景

舊架構有兩個痛點:

1. EC2 上 `docker build` 容易 OOM(記憶體不足)導致服務當機。
2. Web 與 Worker 拆兩台 EC2 只是症狀治療,根因是 build 不該在正式環境機器上做。

新架構將:

- 用 **GitHub Actions runner** 負責 build,EC2 只 pull & run。
- Image 推到 **GHCR Private**(免費、與 GitHub 整合好)。
- Web 與 Worker 合併到**同一台 EC2**,使用 docker-compose 統一管理。
- Backend 與 Worker **共用同一個 image**,只用不同 `command` 區分。

## 具體需求

### 已確認的架構決策

- EC2 數量:**從 2 台合併為 1 台**
- Build 位置:**GitHub Actions(不在 EC2)**
- Image registry:**GHCR Private**
- Image tagging:**Git Commit SHA + `latest` 雙 tag**
- Backend / Worker:**同一個 image,不同 command**
- 本地資料庫:**MySQL container(絕對不直連 RDS)**
- Docker Compose:**拆三檔(base + dev + prod)**

### 分階段實作(請逐階段執行,每階段完成後讓我確認再進下一階段)

#### 階段 1:本地環境改造(不影響正式環境)

**⚠️ 開始前請先探勘**:列出並讀取 `.dockerignore`、`docker-compose.yml`、`.env*`、`backend/Dockerfile`,產出現況報告等我確認。

1. **檢查並補強 `.dockerignore`**(已存在):確認是否排除 `.env`、`.env.*`、`__pycache__`、`.git`、`node_modules`、`.next`。若已涵蓋則跳過,缺項則補上。
2. **重構 docker-compose**(舊版單檔已存在,需拆分):
   - `docker-compose.yml`(基底:service 名稱、network、command、depends_on)
   - `docker-compose.dev.yml`(本地:build、volumes、ports、debug env)
   - `docker-compose.prod.yml`(EC2:image from GHCR、restart: always、resource limits)
   - 拆分時請保留舊檔案的有效設定,不要漏掉既有設定。
3. **將本地 MySQL 移入 `docker-compose.dev.yml`**:目前 MySQL 裝在 Mac 本機,本次改為 8.0 container,搭配 init script 自動建表。請額外引導我:
   - 如何從現有 Mac 本機 MySQL 把資料 dump 出來
   - 如何 import 到新的 container
   - 完成後本機 MySQL 是否可以停用(或保留作為備援)
4. **整理環境變數**:`.env.dev`(本地)與 `.env.prod`(EC2),並產出 `.env.dev.example` / `.env.prod.example` 範本進 repo。
5. **驗收**:本地 `docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build` 能正常啟動 FastAPI 與 Celery,且能連到新的 MySQL container。

#### 階段 2:Dockerfile 優化

**⚠️ 開始前請先探勘**:`cat backend/Dockerfile` 讀取既有內容,評估現況跟 multi-stage 目標的差異,產出調整計畫等我確認。

1. 改成 Multi-stage build(builder + runtime),縮小最終 image 體積。
2. 優化 Layer Cache:`COPY requirements.txt` 跟 `COPY . .` 分開,讓依賴層能快取。
3. 本地 build 測試,確保 image < 500MB(若超過請說明原因與優化方向)。

#### 階段 3:GHCR 手動測試

**⚠️ 開始前請先確認**:詢問我是否已有 GitHub PAT,以及是否曾經登入過 GHCR(可檢查 `~/.docker/config.json`),避免重複建立。

1. 引導我建立 GitHub PAT(需要 `write:packages` / `read:packages` / `delete:packages`)— 若已有則跳過。
2. 在 Mac 上手動測試完整流程:`docker login ghcr.io` → `docker build` → `docker push`。
3. 確認 GHCR 上 image 為 Private 狀態。

#### 階段 4:EC2 環境改造(會影響線上服務,執行前要先 snapshot)

**⚠️ 開始前請先確認**:詢問我目前 EC2 上的服務狀態、檔案結構、是否已 snapshot,並讓我確認本階段執行時機(建議低流量時段)。

1. 引導我備份資料(EC2 snapshot + RDS 備份)、停掉舊服務。
2. EC2 上 `docker login ghcr.io`,認證寫入 `~/.docker/config.json`。
3. EC2 上只放 `docker-compose.yml`、`docker-compose.prod.yml`、`.env.prod`、`nginx/nginx.conf`(不需要原始碼)。
4. 手動 `docker compose pull` + `up -d` 測試。
5. 評估 EC2 規格是否需要升級至 t3.medium(觀察記憶體與 CPU 用量再決定)。
6. 確認穩定後,停止舊的 Worker EC2 instance。

#### 階段 5:GitHub Actions 自動化

**⚠️ 開始前請先探勘**:`ls .github/workflows/` 確認是否已有 workflow 檔,若有請先讀取,避免覆蓋。

1. 引導我設定 GitHub Secrets:`EC2_HOST` / `EC2_USER` / `EC2_SSH_KEY` / `GHCR_PAT`。
2. 建立 `.github/workflows/deploy.yml`,包含兩個 job:
   - **build-and-push**:checkout → login GHCR(用 `GITHUB_TOKEN`)→ docker build → push(同時打 SHA tag 跟 latest tag)。
   - **deploy**:依賴 build-and-push → SSH 進 EC2 → `docker compose pull` → `docker compose up -d` → `docker image prune -f`。
3. 測試完整流程:push 一個小修改,觀察整個 CI/CD 是否成功。

#### 階段 6:補強(可選)

1. 加 healthcheck 確認服務存活。
2. 設定 docker log rotation。
3. 寫 rollback 腳本,能快速回到指定 SHA 版本。

## 限制條件

- **嚴禁將 secret 寫死在 Dockerfile 或 docker-compose**(包括 `ARG` 傳 secret 也不行,會留在 image layer)。
- **`docker-compose.yml`(基底)不可寫 `build:` 或 `image:`**,要由 dev / prod 各自補,避免 EC2 也誤觸 build。
- **本地開發絕對不能直連 AWS RDS**,只用本地 MySQL container。
- **必須相容現有 Nginx reverse proxy 架構**(目前 nginx proxy_pass 到 frontend:3000 與 backend:8000)。
- **Backend / Worker 必須用同一個 image**,只能用 command 區分。
- **每階段完成後先停下來讓我驗證**,不要連續執行多個階段。
- **程式碼註解請用繁體中文**,專有名詞附上英文原文。
- **本人為從函數式風格過渡到 OOP 的初階工程師**,涉及 OOP 設計請適度說明。

## 預期輸出

### 階段 1 預期產出

- `.dockerignore`
- `docker-compose.yml`
- `docker-compose.dev.yml`
- `docker-compose.prod.yml`
- `.env.dev.example`(範本,放進 repo)、`.env.prod.example`(範本)
- `scripts/init.sql`(本地 MySQL 初始化腳本)
- 本地啟動驗收步驟說明

### 階段 2 預期產出

- 改寫後的 `backend/Dockerfile`(multi-stage)
- 本地 build 測試指令與預期結果

### 階段 3 預期產出

- 建立 PAT 的步驟說明
- 手動 push image 到 GHCR 的指令清單

### 階段 4 預期產出

- EC2 上需要保留 / 刪除的檔案清單
- EC2 操作指令清單(備份 → 停服務 → 登入 GHCR → 部署測試)
- 規格升級評估(看跑起來的記憶體 / CPU 使用率再決定)

### 階段 5 預期產出

- `.github/workflows/deploy.yml` 完整檔案
- GitHub Secrets 設定步驟說明
- 完整流程測試方法

### 階段 6 預期產出

- healthcheck 設定
- log rotation 設定
- rollback 腳本(bash)

## 補充資訊

### 現有專案結構參考

```
easy-travel-scheduler/
├── backend/
│   ├── main.py
│   ├── router/
│   ├── schemas/
│   ├── core/
│   ├── repositories/
│   ├── worker/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   └── (Next.js)
├── nginx/
│   └── nginx.conf
└── docker-compose.yml(目前是單一檔案)
```

### 關鍵設計理由(背後思考)

1. **為什麼 Backend / Worker 共用 image?**
   - 兩者本質是「同一個應用程式的不同啟動方式」,共用 Python 版本、requirements.txt、程式碼、settings。
   - 避免「版本漂移」:兩個 image 分別 build 容易出現 schema 不同步。
   - CI/CD 時間減半。

2. **為什麼用 Git SHA 而不是 `latest`?**
   - `latest` 會被覆蓋,失去 rollback 能力。
   - SHA 可完整追溯到 commit,debug 跟 rollback 都方便。

3. **為什麼選 GHCR 而不是 Docker Hub?**
   - 跟 GitHub 整合好,GitHub Actions 用內建 `GITHUB_TOKEN` 即可推送。
   - 個人 private package 免費額度大方。
   - Repo 與 image 權限可分開設定。

### 教學模式

我希望透過這次改造學習 DevOps 與系統架構思維,請在實作前先簡述「為什麼這麼做」、可能的陷阱、以及不同做法的取捨,**不要直接給完整程式碼**,除非我說「請開始實作」。每個檔案產出後,請拋出 1-2 個問題引導我思考(例如「你覺得這個 Dockerfile 還有哪裡可以再優化?」)。
