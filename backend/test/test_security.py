import pytest
from core.security import hash_password, verify_password


def test_password_hashing_and_verification():
    """測試密碼加密及驗證功能"""

    plain_password = "my_super_secret_password"
    wrong_password = "wrong_password123"

    hashed_pw = hash_password(plain_password)

    assert hashed_pw != plain_password

    is_valid = verify_password(plain_password, hashed_pw)
    assert is_valid is True

    is_invalid = verify_password(wrong_password, hashed_pw)
    assert is_invalid is False