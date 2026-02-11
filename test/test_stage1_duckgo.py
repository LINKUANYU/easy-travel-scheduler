# 引入需要的庫
from ddgs import DDGS

def search_with_duckduckgo(query):
    # 🔍 Debug: 先印出來看看，確定真的有傳對關鍵字進去
    print(f"🕵️ 正在向 DuckDuckGo 查詢關鍵字：[{query}]") 
    
    results = []
    try:
        with DDGS() as ddgs:
            # ==========================================
            # 🛡️ 加入 safesearch='strict' (嚴格過濾成人/垃圾內容)
            # 🛡️ 確認 region='tw-tz' (鎖定台灣繁體中文結果)
            # ==========================================
            ddgs_gen = ddgs.text(
                query, 
                region='tw-tz', 
                safesearch='strict', # <--- 關鍵修改：強制開啟安全搜尋
                timelimit='y',       # <--- 建議加入：只找 'y' (過去一年) 的資料，避免找到十年前舊文
                max_results=10
            )
            
            for r in ddgs_gen:
                print(f"   -> 找到結果：{r['title'][:20]}...") # 印出前20個字檢查
                results.append(f"標題: {r['title']}\n網址: {r['href']}\n摘要: {r['body']}")
                
    except Exception as e:
        print(f"⚠️ 搜尋發生錯誤: {e}")
    
    if not results:
        print("❌ 警告：搜尋結果為空！請檢查關鍵字是否正確。")
        
    return "\n\n".join(results)

# 測試一下 (請直接執行這段，不要接 Gemini)
if __name__ == "__main__":
    test_query = "台北 旅遊遊記 必去景點"
    data = search_with_duckduckgo(test_query)
    print("\n---------- 最終抓到的資料 ----------")
    print(data)