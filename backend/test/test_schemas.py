import pytest
from datetime import date
from pydantic import ValidationError

from schemas.auth import SignupIn
from schemas.trip import TripCreateIn

def test_signup_schema_valid():
    """測試註冊資料是否能通過"""
    data = {
        "email": "linkuanyu@example.com",
        "password": "secure_password_123",
        "name": "Lin"
    }
    user = SignupIn(**data)

    assert user.email == data["email"]
    assert user.name == data["name"]

def test_signup_schema_invalid_email():
    """測試錯誤的 email 格式是否會被擋下"""
    with pytest.raises(ValueError):
        SignupIn(email="non-an-email", password="secure_password_123",name="Lin")

def test_signup_schema_pw_too_short():
    """測試密碼太短 (少於 8 字) 是否會報錯"""
    with pytest.raises(ValueError):
        SignupIn(email="linkuanyu@example.com", password="short",name="Lin")


def test_trip_create_schema_valid():
    """測試正常的行程建立資料 (只有 title, days, start_date)"""
    
    data = {
        "title": "日本五天四夜",
        "days": 5,
        "start_date": date(2024, 5, 1) # 測試選填欄位
    }
    trip = TripCreateIn(**data)
    assert trip.title == data["title"]
    assert trip.days == data["days"]

def test_trip_create_schema_invalid_days():
    """測試天數超出範圍 (0 天或 61 天) 是否會被擋下"""
    with pytest.raises(ValidationError):
        TripCreateIn(title="三天兩夜", days=0)

    with pytest.raises(ValidationError):
        TripCreateIn(title="三天兩夜", days=61)

def test_trip_create_schema_invalid_title():
    """測試標題長度是否符合規定 (1 ~ 100 字)"""
    with pytest.raises(ValidationError):
        TripCreateIn(title="", days=5)
        
    long_title = "A" * 101
    with pytest.raises(ValidationError):
        TripCreateIn(title=long_title, days=5)