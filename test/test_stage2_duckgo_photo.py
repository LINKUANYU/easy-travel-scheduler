import json
from ddgs import DDGS

def get_place_details(place_name):
    print(f"🔍 正在搜尋：{place_name} ...")
    
    # 初始化結果字典
    final_data = {
        "name": place_name,
        "images": [],
    }

    # 使用 context manager 自動處理連線
    with DDGS() as ddgs:
        # ---------------------------------------------------------
        # 2. 搜尋圖片 (加入版權過濾)
        # ---------------------------------------------------------
        print("   -> 正在抓取無版權圖片...")
        try:
            # 加入 license 參數
            # license='Public' -> 公眾領域 (最安全，像 CC0)
            # license='Share'  -> 允許分享 (通常需要標示出處)
            # license='Modify' -> 允許修改
            
            images_results = list(ddgs.images(
                place_name, 
                max_results=3, 
                safesearch='on',
                license='Public'  # <--- 關鍵修改在這裡！
            ))
            
            for img in images_results:
                final_data["images"].append({
                    "title": img.get("title"),
                    "url": img.get("image"),
                    "source": img.get("url") # 最好保留原始網頁連結，以備不時之需
                })
                
        except Exception as e:
            print(f"   ❌ 圖片搜尋錯誤: {e}")

    return final_data

# ==========================================
# 主程式執行區
# ==========================================
if __name__ == "__main__":
    target_spot = "台北101"  # 你可以手動改這裡測試其他地點
    
    result = get_place_details(target_spot)
    
    print("\n" + "="*30)
    print("✅ 最終產出的 JSON 結果：")
    print("="*30)
    
    # 將 dict 轉成漂亮的 JSON 字串印出來
    # ensure_ascii=False 讓中文正常顯示，不會變成亂碼
    print(json.dumps(result, ensure_ascii=False, indent=4))