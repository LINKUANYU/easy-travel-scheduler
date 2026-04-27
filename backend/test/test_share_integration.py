"""
整合測試：GET /api/share/{token}

測試策略：
- Case 1：token 不存在 → 確認 API 回 404（用 mock cursor，不需要真實 DB）
- Case 2：token 存在   → 確認 API 回 200 + response 結構正確（Strategy A：手動設定 token）
- Case 3：token 由 fixture 自動建立與清除（Strategy B：自給自足）
"""

import pytest

# ─── 設定區 ───────────────────────────────────────────────
# 填入你資料庫裡真實存在的 share_token
VALID_SHARE_TOKEN = "GBs9zxd5i7k4ey9elotV-A"
# ─────────────────────────────────────────────────────────

_token_not_set = VALID_SHARE_TOKEN == "your_real_token_here"


class TestGetSharedTrip:

    # ── Case 1：token 不存在 → 404 ────────────────────────
    def test_invalid_token_returns_404(self, client_no_db):
        """
        用 mock cursor（永遠回傳 None），
        模擬資料庫裡查不到這個 token 的情況。
        API 應該回 404。
        """
        response = client_no_db.get("/api/share/this_token_definitely_does_not_exist")

        assert response.status_code == 404

    # ── Case 2：token 存在 → 200 ──────────────────────────
    @pytest.mark.skipif(_token_not_set, reason="請先設定 VALID_SHARE_TOKEN")
    def test_valid_token_returns_200(self, client_with_db):
        """用真實 DB，給一個有效的 token，應該回 200。"""
        response = client_with_db.get(f"/api/share/{VALID_SHARE_TOKEN}")

        assert response.status_code == 200

    @pytest.mark.skipif(_token_not_set, reason="請先設定 VALID_SHARE_TOKEN")
    def test_valid_token_response_structure(self, client_with_db):
        """
        回傳的 JSON 必須符合 SharedTripDataOut 的結構：
        - 頂層有 'trip' 和 'itinerary' 兩個 key
        - trip 裡有 trip_id、title、days
        - itinerary 是 dict（key 是天數）
        """
        response = client_with_db.get(f"/api/share/{VALID_SHARE_TOKEN}")
        data = response.json()

        assert "trip" in data
        assert "itinerary" in data

        trip = data["trip"]
        assert "trip_id" in trip
        assert "title" in trip
        assert "days" in trip

        assert isinstance(data["itinerary"], dict)


# ── Strategy B：fixture 自動管理測試資料 ──────────────────────
class TestGetSharedTripStrategyB:

    def test_returns_200_with_fixture_data(self, client_with_db, db_trip):
        """
        db_trip fixture 在測試開始前 INSERT 一筆 trip，
        測試結束後自動 DELETE，完全不依賴手動準備的資料。
        """
        token = db_trip["share_token"]

        response = client_with_db.get(f"/api/share/{token}")

        assert response.status_code == 200

    def test_response_matches_inserted_data(self, client_with_db, db_trip):
        """
        驗證 API 回傳的內容和我們 INSERT 的資料一致。
        這比只驗 status code 更有價值——確認資料真的有被正確讀出來。
        """
        token = db_trip["share_token"]
        expected_trip_id = db_trip["trip_id"]

        response = client_with_db.get(f"/api/share/{token}")
        data = response.json()

        assert data["trip"]["trip_id"] == expected_trip_id
        assert data["trip"]["title"] == "測試行程"
        assert data["trip"]["days"] == 2
