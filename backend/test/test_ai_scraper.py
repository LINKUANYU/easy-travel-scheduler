import pytest
from services.ai_scraper import clean_and_slice_text

# ---------------------------------------------------------
# 1. 測試：是否能正確移除圖片與超連結語法
# ---------------------------------------------------------
def test_clean_links_and_images():
    raw_text = "這是一張圖片![風景圖](https://example.com/img.jpg)和一個[點我前往](https://example.com)的連結。"

    result = clean_and_slice_text(raw_text)

    assert "https://example.com" not in result
    assert "![風景圖]" not in result
    assert "這是一張圖片和一個點我前往的連結。" in result

# ---------------------------------------------------------
# 2. 測試：防線一（導覽列雜訊過濾）
# ---------------------------------------------------------
def test_remove_mega_menu_noise():
    raw_text = """
* 首頁
- 關於我們
* 日本旅遊
- 這是一個字數超過二十個字的正常列表項目，絕對不能被當成導覽列刪掉喔！因為它很長。
    """

    result = clean_and_slice_text(raw_text)

    assert "* 首頁" not in result
    assert "- 關於我們" not in result
    assert "* 日本旅遊" not in result

    assert "超過二十個字的正常列表項目" in result

# ---------------------------------------------------------
# 3. 測試：防線二（尋找文章重心與字數裁切）
# ---------------------------------------------------------
def test_find_article_center_and_slice():
    # 模擬一篇很長的文章
    # 前面塞入 400 個字的廢話前言 (400 > 300)
    prefix_text = "廢話" * 200
    
    # 文章重心在這裡
    main_content = "\n## 東京必去景點推薦\n這裡是文章精華區！"

    # 後面塞入 5000 個字的結語
    suffix_text = "結語" * 5000

    raw_text = prefix_text + main_content + suffix_text
    result = clean_and_slice_text(raw_text)

    assert len(result) <= 8000

    assert "東京必去景點推薦" in result
    
    # 抓到重點後往前推300字，所以廢話應該會有150個，代表不是從頭開始抓字
    assert result.count("廢話") == 150