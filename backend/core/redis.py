import redis
import redis.asyncio as aioredis  # 非同步 Redis 客戶端，專給 Pub/Sub 的 SUBSCRIBE 使用
import os
import json
from functools import wraps
from fastapi.encoders import jsonable_encoder

# 建立 Redis 連線池
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)

redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    password=REDIS_PASSWORD,
    decode_responses=True,  # 🌟 關鍵：自動將 Redis 裡的二進位資料轉為字串，對處理 JSON 很方便
)


def get_redis():
    return redis_client


async def get_async_redis():
    """
    建立一條獨立的非同步 Redis 連線，專門給 Pub/Sub 的 SUBSCRIBE 使用。

    注意：不能用現有的同步連線池（redis_client），原因有兩個：
    1. SUBSCRIBE 指令會讓連線進入「訂閱模式」，此後這條連線只能收訊息，不能做其他操作。
       若共用連線池，其他功能（快取查詢）就會被卡住。
    2. 同步連線的 .read() 是阻塞式（blocking），會卡住 FastAPI 的 Event Loop，
       導致整個伺服器無法處理其他請求。非同步客戶端則是 await，讓 Event Loop 自由切換。

    每次 SSE 連線建立時呼叫此函式取得獨立連線，連線結束時記得呼叫 await conn.close()。
    """
    return await aioredis.from_url(
        f"redis://{REDIS_HOST}:{REDIS_PORT}",
        password=REDIS_PASSWORD,
        decode_responses=True,  # 自動將 bytes 解碼為字串，方便直接比對訊息內容
    )


def redis_cache(cache_key: str, expire_seconds: int = 3600):
    def decoreator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            redis_client = get_redis()

            # 1. 先查快取，如果命中直接回給前端
            try:
                cached_data = redis_client.get(cache_key)
                if cached_data:
                    return {"status": "success", "data": json.loads(cached_data)}
            except Exception as e:
                print(f"⚠️ Redis 讀取失敗: {e}")

            # 2. 執行原本的 function
            result_data = func(*args, **kwargs)

            # 3. 結果貼到快取
            try:
                redis_client.setex(
                    cache_key,
                    expire_seconds,
                    json.dumps(jsonable_encoder(result_data["data"])),
                )
            except Exception as e:
                print(f"⚠️ Redis 寫入失敗: {e}")

            return result_data  # 回給前端

        return wrapper

    return decoreator
