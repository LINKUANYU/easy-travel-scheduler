from fastapi import APIRouter, Depends, Request, Response, HTTPException
from schemas.auth import *
from core.database import *
from core.security import *
from core.dependencies import *
from core.redis import redis_client
import pymysql
from pymysql.err import IntegrityError
import secrets
import os
from schemas.common import OkOut
from typing import Optional

router = APIRouter()

SESSION_TTL = int(os.getenv("SESSION_DAYS", 14)) * 86400


@router.post("/api/signup", response_model=UserOut)
def register(payload: SignupIn, response: Response, cur=Depends(get_cur)):
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

        sid = secrets.token_hex(32)
        redis_client.setex(f"session:{sid}", SESSION_TTL, str(user_id))
        set_session_cookie(response, sid)

        return {"id": user_id, "email": payload.email, "name": payload.name}
    except IntegrityError as e:
        if len(e.args) >= 1 and e.args[0] == 1062:
            raise HTTPException(status_code=409, detail="Email already exists")
        raise


@router.post("/api/login", response_model=UserOut)
def login(
    payload: LoginIn,
    request: Request,
    response: Response,
    cur=Depends(get_cur)
):
    try:
        cur.execute(
            "SELECT id, email, name, password_hash, is_active FROM users WHERE email = %s LIMIT 1",
            (payload.email,),
        )
        user = cur.fetchone()
    except pymysql.MySQLError as e:
        print(f"Database error: {e}，查詢使用者失敗")
        raise HTTPException(status_code=500, detail="查詢使用者失敗")

    if not user or user["is_active"] != 1:
        raise HTTPException(status_code=401, detail="帳號或密碼輸入錯誤")

    if not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="帳號或密碼輸入錯誤")

    sid = secrets.token_hex(32)
    redis_client.setex(f"session:{sid}", SESSION_TTL, str(user["id"]))
    set_session_cookie(response, sid)

    return {"id": user["id"], "email": user["email"], "name": user["name"]}


@router.get("/api/me", response_model=Optional[UserOut])
def me(current_user=Depends(get_optional_user)):
    return current_user


@router.post("/api/logout", response_model=OkOut)
def logout(request: Request, response: Response):
    sid = request.cookies.get(SID_COOKIE_NAME)

    clear_session_cookie(response)

    if sid:
        redis_client.delete(f"session:{sid}")

    return {"ok": True}