# backend/Dockerfile
FROM python:3.10-slim

# 設定工作目錄
WORKDIR /app

# 安裝系統層級的依賴 (有些 Python 套件編譯會用到)
RUN apt-get update && apt-get install -y gcc default-libmysqlclient-dev && rm -rf /var/lib/apt/lists/*

# 複製 requirements.txt 並安裝
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 把後端程式碼全部複製進去
COPY . .

# 預設啟動指令 (FastAPI)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]