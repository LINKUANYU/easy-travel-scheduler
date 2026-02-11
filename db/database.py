from dbutils.pooled_db import PooledDB
import pymysql
from fastapi import Depends, HTTPException
import os
import sys

# RDS_KEY = os.getenv('RDS_KEY')

DB_HOST = os.getenv('DB_HOST')
DB_PORT = os.getenv('DB_PORT')
DB_USER = os.getenv('DB_USER')
DB_PASSWORD = os.getenv('DB_PASSWORD')

if not DB_PASSWORD:
    sys.exit("Critical Error: DB connect fail, missing access keys in environment variables.")

POOL = PooledDB(
    creator=pymysql,  # 使用 PyMySQL 作為驅動
    maxconnections=5,  # 連線池最大連線數
    mincached=2,       # 初始化時，池中至少存在的空閒連線數
    host=DB_HOST,
    user=DB_USER,
    password= DB_PASSWORD,
    database='final_project',
    charset='utf8mb4',
    cursorclass=pymysql.cursors.DictCursor, # cursor() 就會回傳字典型態的資料了
    blocking=True      # 連線池滿了時，是否要等待（True 為等待）
)

def get_conn():
    conn = None
    try:
        # 因為 blocking=True，如果池滿了會在那裡等，不需要手動寫重試迴圈
        conn = POOL.connection() 
        yield conn
    except pymysql.MySQLError as e:
        # 捕捉資料庫層級的錯誤 (如帳密錯、連線超時)
        print(f"資料庫連線失敗: {e}")
        raise HTTPException(status_code=500, detail="Database connection failed")
    except Exception as e:
        # 捕捉其他非預期錯誤 (如連線池滿了且等待超時)
        print(f"取得連線時發生非預期錯誤: {e}")
        raise HTTPException(status_code=500, detail="Internal Server Error")
    finally:
        if conn:
            conn.close()

def get_cur(conn=Depends(get_conn)):
    # 注意：你在 POOL 已經設定了 cursorclass=pymysql.cursors.DictCursor
    # 這裡直接呼叫 cursor() 就會回傳字典型態的資料了
    cur = conn.cursor()
    try:
        yield cur
    finally:
        cur.close()