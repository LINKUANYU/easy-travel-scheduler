from fastapi import Request, HTTPException, Depends
from fastapi.security import APIKeyHeader, APIKeyCookie
from core.database import *
from core.security import SID_COOKIE_NAME

# 建立 Swagger UI 辨識用的 Security Schemes
# auto_error=False 代表交給我們自己用 if/else 處理 401/403，不要讓 FastAPI 強制阻擋
cookie_scheme = APIKeyCookie(name=SID_COOKIE_NAME, auto_error=False)  # 從 cookie 拿出 sid
edit_token_scheme = APIKeyHeader(name="X-Edit-Token", auto_error=False)  # 從 Header 中拿取前端出示的token

def get_current_user(
    request: Request,
    cur=Depends(get_cur),
    sid: str = Depends(cookie_scheme)
):
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


def assert_trip_owner(
    trip_id: int, 
    request: Request, 
    cur=Depends(get_cur),
    sid: str = Depends(cookie_scheme),
    client_token: str = Depends(edit_token_scheme)
):
    """
    共用的行程權限驗證 Dependency
    """

    # 1. 查詢該trip的狀態
    cur.execute("SELECT user_id, edit_token FROM trips WHERE id = %s", (trip_id,))
    trip = cur.fetchone()

    if not trip:
        raise HTTPException(status_code=404, detail="找不到該行程")
    
    # 2. 情境一：這是一個「已認領（有主人）」的trip，要檢查session
    if trip["user_id"] is not None:
        if not sid:
            raise HTTPException(status_code=403, detail="此為私人行程，請先登入")

    # 驗證 Session 是否有效且屬於該擁有者
        cur.execute("""
            SELECT s.user_id 
            FROM sessions s
            WHERE s.session_id = %s 
              AND s.revoked_at IS NULL 
              AND s.expires_at > UTC_TIMESTAMP()
        """, (sid,))
        session_user = cur.fetchone()

        if not session_user or session_user["user_id"] != trip["user_id"]:
            raise HTTPException(status_code=403, detail="無權限修改此行程 (非擁有者)")
        
    # 3. 情境二：這是一個「匿名暫存」的無主行程，要檢查edit_token
    else:
        # 如果前端沒帶token，或是跟資料庫裡的不匹配，就拒絕！
        if not client_token or client_token != trip["edit_token"]:
            raise HTTPException(status_code=403, detail="無效的編輯權限 (缺少或錯誤的token)")
            
    # 驗證通過，放行！
    return True


# 非強制的登入檢查（只回傳資料或 None，不拋出 401 錯誤）
def get_optional_user(
    request: Request,
    cur=Depends(get_cur),
    sid: str = Depends(cookie_scheme)
):
    if not sid:
        return None  # 沒帶 Cookie，默默回傳 None

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
    return row  # 有找到回傳資料，沒找到也是回傳 None