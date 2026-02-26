from fastapi import APIRouter, Depends, Request, Response, HTTPException
from model.schema import *
from services.db_service import *
from services.helper_auth import *
import pymysql
from pymysql.err import IntegrityError
import secrets
from datetime import datetime, timezone, timedelta

router = APIRouter()

@router.post("/api/signup", response_model=UserOut)
def register(payload: SignupIn, cur=Depends(get_cur)):
    pw_hash = hash_password(payload.password)

    try:
        cur.execute(
            """
            INSERT INTO users (email, name, password_hash)
            VALUES (%s, %s, %s)
            """,
            (payload.email, payload.name, pw_hash),
        )
        user_id = cur.lastrowid
        return {"id": user_id, "email": payload.email, "name": payload.name}
    except IntegrityError as e:
        # e.args 通常長這樣: (1062, "Duplicate entry 'a@b.com' for key 'uk_users_email'")
        if len(e.args) >= 1 and e.args[0] == 1062:
            raise HTTPException(status_code=409, detail="Email already exists")
        raise


@router.post("/api/login", response_model=UserOut)
def login(
    payload: LoginIn,
    request: Request,
    response: Response,
    cur = Depends(get_cur)
):
    # 1. 查詢使用者
    try:
        cur.execute("""
            SELECT id, email, name, password_hash, is_active FROM users WHERE email = %s LIMIT 1
        """,
        (payload.email,)
        )
        user = cur.fetchone()
    except pymysql.MySQLError as e:
        print(f"Database error: {e}，查詢使用者失敗")
        raise HTTPException(status_code=500, detail="查詢使用者失敗")
    
    if not user or user["is_active"] != 1:
        raise HTTPException(status_code=401, detail="帳號或密碼輸入錯誤")
    
    if not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="帳號或密碼輸入錯誤")
        
    # Secrets：Python 標準庫，專門用來產生密碼學等級的隨機值
    # token_hex(...) 會把這 32 bytes 轉成 十六進位字串（hex）
    # 32 bytes → 64 個 hex 字元，所以才寫 64 chars
    sid = secrets.token_hex(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days = 14) # aware UTC
    expires_at_db = expires_at.replace(tzinfo=None)  # 變成 naive，但語意是 UTC

    # 2. 建立session、插入DB
    try:
        cur.execute("""
            INSERT INTO sessions (session_id, user_id, expires_at)
            VALUES (%s, %s, %s)
        """, (sid, user["id"], expires_at_db))

    except pymysql.MySQLError as e:
        print(f"Database error: {e}，Session寫入DB失敗")
        raise HTTPException(status_code=500, detail="Session寫入DB失敗")
    
    # 3. 設定cookie
    set_session_cookie(response, sid)
    return {"id": user["id"], "email": user["email"], "name": user["name"]}

@router.get("/api/me")
def me(current_user = Depends(get_current_user)):
    return current_user

@router.post("/api/logout")
def logout(
    request: Request,
    response: Response,
    cur = Depends(get_cur)
):
    sid = request.cookies.get(SID_COOKIE_NAME)
    
    # 1.先清 cookie：確保 client 一定登出
    clear_session_cookie(response)

    if not sid:
        return {"ok": True}

    # 2.DB 寫revoked
    try:
        cur.execute("UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE session_id = %s AND revoked_at IS NULL", (sid,))
    except pymysql.MySQLError as e:
        print(f"Database error: {e}，Session Update revoked_at 失敗")
        # 這裡不 raise 錯誤，只記log不擋登出

    return {"ok": True}