from dbutils.pooled_db import PooledDB
import pymysql
from fastapi import Depends, HTTPException
import os
import sys


DB_HOST = os.getenv("DB_HOST")
DB_PORT = int(os.getenv("DB_PORT", 3306))
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")

if not all([DB_HOST, DB_USER, DB_PASSWORD, DB_NAME]):
    sys.exit("Critical Error: Missing environment variables for DB connection.")

POOL = PooledDB(
    creator=pymysql,  # 使用 PyMySQL 作為驅動
    maxconnections=5,  # 連線池最大連線數
    mincached=2,  # 初始化時，池中至少存在的空閒連線數
    # 🌟 ping=4：每次「執行 query 前」先對 MySQL 送一個輕量的 COM_PING 心跳封包，
    #    確認這條連線還活著。若連線已被 RDS 的 wait_timeout（預設 8 小時）斷開
    #    而變成「殭屍連線」，PyMySQL 會自動重建一條新連線頂替，避免請求卡死。
    #    ping 是 bitmask：0=從不, 1=建立時(預設), 2=建 cursor 時, 4=執行 query 時, 7=全部。
    #    我們的 backend 與 RDS 在同一 VPC 內網，COM_PING 往返 <1ms，開銷可忽略。
    ping=4,
    host=DB_HOST,
    user=DB_USER,
    port=DB_PORT,
    password=DB_PASSWORD,
    database=DB_NAME,
    charset="utf8mb4",
    cursorclass=pymysql.cursors.DictCursor,  # cursor() 就會回傳字典型態的資料了
    blocking=True,  # 連線池滿了時，是否要等待（True 為等待）
)


def set_utc(conn):
    with conn.cursor() as cur:
        cur.execute("SET time_zone = '+00:00'")  # 讓 TIMESTAMP 轉換語意固定在 UTC


def get_conn():
    conn = None
    try:
        # 因為 blocking=True，如果池滿了會在那裡等，不需要手動寫重試迴圈
        conn = POOL.connection()
        set_utc(conn)
    except pymysql.MySQLError as e:
        # 捕捉資料庫層級的錯誤 (如帳密錯、連線超時)
        print(f"資料庫連線失敗: {e}")
        raise HTTPException(status_code=500, detail="資料庫連線失敗")

    # 給路由用的
    try:
        yield conn  # 在這裡交給路由使用
        conn.commit()  # 路由邏輯正常return後執行
    except Exception:  # 路由拋出 HTTPException 或 IntegrityError
        conn.rollback()  # 執行這個
        raise  # 繼續往外丟給Fast api
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
