from passlib.context import CryptContext
from fastapi import Request, Response, HTTPException, Depends
from services.db_service import *
import os
from dotenv import load_dotenv
load_dotenv()




SID_COOKIE_NAME = "sid"


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)

def set_session_cookie(resp: Response, sid: str):
    
    session_days = os.getenv("SESSION_DAYS", 14)
    max_age_seconds = session_days * 24 * 60 * 60
    
    resp.set_cookie(
        key=SID_COOKIE_NAME,
        value=sid,
        httponly=True,
        secure=os.getenv('COOKIE_SECURE', False),
        samesite=os.getenv('COOKIE_SAMESITE', 'lax'),
        max_age=max_age_seconds,
        path="/",
    )

def clear_session_cookie(resp: Response):
    resp.delete_cookie(key=SID_COOKIE_NAME, path="/")

def get_current_user(
    request: Request,
    cur=Depends(get_cur),
):
    sid = request.cookies.get(SID_COOKIE_NAME)
    if not sid:
        raise HTTPException(status_code=401, detail="Not authenticated")

    
    cur.execute(
        """
        SELECT u.id, u.email, u.name
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.session_id = %s
          AND s.revoked_at IS NULL
          AND s.expires_at > UTC_TIMESTAMP()
          AND u.is_active = 1
        LIMIT 1
        """,
        (sid,),
    )
    row = cur.fetchone()
    
    if not row:
        raise HTTPException(status_code=401, detail="Not authenticated")

    return row
