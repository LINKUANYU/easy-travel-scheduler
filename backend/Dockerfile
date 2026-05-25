# backend/Dockerfile
# ─────────────────────────────────────────────────────────────
# Multi-stage Build（多階段建構）
#
# 為什麼要這樣做？
#   - 第一階段（builder）負責「編譯」：安裝 gcc 等編譯工具、跑 pip install
#   - 第二階段（runtime）負責「執行」：只把 venv 整包複製過來，不帶編譯工具
#   - 最終 image 裡沒有 gcc / libmysqlclient-dev，體積更小、攻擊面更低
#
# 為什麼用 venv 而不是 pip install --target？
#   - --target 只複製套件本體，但 celery / uvicorn 等 CLI 執行檔放在 bin/ 裡
#     不會一起被複製，導致 "executable not found in $PATH" 錯誤
#   - venv 把套件（site-packages/）與 CLI（bin/）全部放在同一個資料夾 /venv
#     整包 COPY --from=builder 就能連 CLI 一起帶過來，乾淨不漏
# ─────────────────────────────────────────────────────────────

# ── Stage 1：Builder（編譯/安裝階段）────────────────────────
FROM python:3.10-slim AS builder

WORKDIR /app

# 安裝編譯時期才需要的系統套件：
#   gcc                        → C 編譯器，部分 Python C extension 需要
#   default-libmysqlclient-dev → mysqlclient 套件編譯時需要的 header 與靜態庫
# 安裝完立即清除 apt 快取，減少這一層的大小
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       gcc \
       default-libmysqlclient-dev \
    && rm -rf /var/lib/apt/lists/*

# 建立 Python 虛擬環境（Virtual Environment）到 /venv
# 使用 venv 的優點：套件本體（site-packages/）與 CLI 執行檔（bin/）都在同一個目錄下
# 整包複製到 Stage 2 就不會漏掉 celery、uvicorn 等 CLI 工具
RUN python -m venv /venv

# 先複製 requirements.txt，再安裝依賴
# 這樣當程式碼有變動但 requirements.txt 沒變時，Docker 可以命中快取（cache hit）
# 只有 requirements.txt 改變時才會重新執行 pip install，大幅加速 rebuild
COPY requirements.txt .

# 用 venv 裡的 pip 安裝所有依賴
# /venv/bin/pip 確保套件裝進 venv 而非系統 Python
RUN /venv/bin/pip install --no-cache-dir -r requirements.txt

# ── Stage 2：Runtime（執行階段）─────────────────────────────
FROM python:3.10-slim AS runtime

WORKDIR /app

# 安裝執行時期需要的系統套件：
#   libmariadb3  → mysqlclient 在執行期間需要的 runtime 動態連結庫（.so）
#                  注意：這是 -dev 套件的「輕量版」，只有 runtime 用的部分
#   curl         → 供 docker-compose healthcheck 探測用（GET /health）
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libmariadb3 \
       curl \
    && rm -rf /var/lib/apt/lists/*

# 從 builder stage 複製整個 venv（含套件 + CLI 執行檔）
# COPY --from=builder 是 Multi-stage 的核心語法，代表「從第一階段拿東西過來」
# builder 階段的 gcc、libmysqlclient-dev 不會跟著過來，最終 image 不包含
COPY --from=builder /venv /venv

# 複製後端程式碼（放在 COPY venv 之後，利用 cache：改程式碼不會導致套件重裝）
COPY . .

# 把 venv 的 bin 目錄加入 PATH，讓 celery / uvicorn 等指令可以直接執行
# 設定 VIRTUAL_ENV 是 venv 的慣例，部分工具會依此判斷是否在 venv 環境中
ENV PATH="/venv/bin:$PATH" \
    VIRTUAL_ENV="/venv"

# 預設啟動指令（FastAPI）
# docker-compose 的 worker service 會用不同的 command 覆蓋這行，啟動 Celery
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
