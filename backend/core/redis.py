import redis
import os

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