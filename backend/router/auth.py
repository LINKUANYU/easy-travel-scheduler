from fastapi import APIRouter, Depends, Request
from model.schema import *
from services.db_service import *
from services.helper_auth import *
from pymysql.err import IntegrityError


router = APIRouter()

@router.post("/api/signup", response_model=UserOut, status_code=201)
def register(payload: SignupIn, conn=Depends(get_conn)):
    pw_hash = hash_password(payload.password)
    cur = conn.cursor(dictionary=True)
    try:
        cur.execute(
            """
            INSERT INTO users (email, name, password_hash)
            VALUES (%s, %s, %s)
            """,
            (payload.email, payload.name, pw_hash),
        )
        user_id = cur.lastrowid
        cur.close()
        return {"id": user_id, "email": payload.email, "name": payload.name}
    except IntegrityError as e:
        # e.args 通常長這樣: (1062, "Duplicate entry 'a@b.com' for key 'uk_users_email'")
        if len(e.args) >= 1 and e.args[0] == 1062:
            raise HTTPException(status_code=409, detail="Email already exists")
        raise
