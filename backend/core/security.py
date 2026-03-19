from passlib.context import CryptContext
from fastapi import Request, Response, HTTPException, Depends
from core.database import *
import os
from dotenv import load_dotenv
load_dotenv()

SID_COOKIE_NAME = "sid"

pwd_context = CryptContext(schemes=["argon2"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)

def set_session_cookie(resp: Response, sid: str):
    
    session_days = int(os.getenv("SESSION_DAYS", 14))
    max_age_seconds = session_days * 24 * 60 * 60

    is_secure = str(os.getenv('COOKIE_SECURE', 'False')).lower() == 'true'
    
    resp.set_cookie(
        key=SID_COOKIE_NAME,
        value=sid,
        httponly=True,
        secure=is_secure,
        samesite=os.getenv('COOKIE_SAMESITE', 'lax'),
        max_age=max_age_seconds,
        path="/",
    )

def clear_session_cookie(resp: Response):
    resp.delete_cookie(key=SID_COOKIE_NAME, path="/")
