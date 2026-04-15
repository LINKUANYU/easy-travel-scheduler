import redis
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
    decode_responses=True # 🌟 關鍵：自動將 Redis 裡的二進位資料轉為字串，對處理 JSON 很方便
)

def get_redis():
    return redis_client


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
                redis_client.setex(cache_key, expire_seconds, json.dumps(jsonable_encoder(result_data['data'])))
            except Exception as e:
                print(f"⚠️ Redis 寫入失敗: {e}")

            return result_data # 回給前端
        
        return wrapper
    
    return decoreator