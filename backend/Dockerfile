FROM python:3.12-slim

WORKDIR /app

# 基礎環境（如果你有用到需要編譯的套件再加 build-essential）
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

# 把後端程式碼拷進去
COPY . /app

EXPOSE 8000

# Demo/部署建議不要 --reload（穩定）
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]