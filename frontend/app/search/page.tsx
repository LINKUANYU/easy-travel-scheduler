"use client";

import { useEffect, useState, useMemo, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiPost, apiGet } from "@/app/lib/api";
import ResultsSection from "@/app/components/search/ResultsSection";
import { useTripDraft } from "@/app/hooks/useTripDraft";
import { useQuery } from "@tanstack/react-query";
import type { Attraction } from "@/app/types/all-types";
import { useTask } from "../context/TaskContext";
import AddPlacesToTripBtn from "@/app/components/home/AddPlacesToTripBtn";
import toast from "react-hot-toast";


function SearchContent() {
  const searchParams = useSearchParams();
  const location = searchParams.get("location"); // 抓取網址上的 ?location= 值
  const router = useRouter();

  const { taskState, startBackgroundPolling } = useTask(); // 呼叫取得全域廣播

  const [travelList, setTravelList] = useState<Attraction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [isExhausted, setIsExhausted] = useState(false);

  const { ids, add, remove, activeTripId } = useTripDraft();

  const refreshKey = searchParams.get("t"); // 🌟 抓取 TaskContext 傳來的時間戳記

  // 用來記錄「已經發送過 API 的地點」的紀錄本，為了阻止 React Strict Mode 「掛載 ➔ 卸載 ➔ 重新掛載」的第二次執行
  const fetchedLocationRef = useRef<string | null>(null);

  // 取得該行程已排入的景點
  const activeTripPlacesQ = useQuery({
    queryKey: ["activeTripPlaces", activeTripId],
    enabled: activeTripId !== null,
    queryFn: async () => apiGet<any[]>(`/api/trips/${activeTripId}/places`),
  });

  const scheduledIds = useMemo(() => {
    const set = new Set<string>();
    if (activeTripPlacesQ.data) {
      activeTripPlacesQ.data.forEach((p: any) => {
        if (p.google_place_id) set.add(p.google_place_id);
      });
    }
    return set;
  }, [activeTripPlacesQ.data]);

  
  useEffect(() => {
    if (!location) {
      router.push("/"); 
      return;
    }

    const allowScrape = !(taskState === 'polling');


    // ==========================================
    // 防護網：攔截「上一頁」與「F5 重新整理」
    // ==========================================
    const existingTaskId = sessionStorage.getItem(`crawling_task_${location}`);
    
    if (existingTaskId) {
      // 重新啟動背景輪詢 (就算使用者按 F5 把 TaskContext 的計時器刷掉了，這裡也能瞬間把它救回來)
      startBackgroundPolling(existingTaskId, location, () => {
        setError("搜尋失敗，請檢查輸入地點，或稍後再試");
        setIsLoading(false);
      });
    }

    // 用來記錄「已經發送過 API 的地點」的紀錄本，為了阻止 React Strict Mode 「掛載 ➔ 卸載 ➔ 重新掛載」的第二次執行
    // 加上 refreshKey 確保點擊 Toast 的強制刷新能夠穿透這道護城河
    if (fetchedLocationRef.current === location + refreshKey) return;
    fetchedLocationRef.current = location + refreshKey;
    
    // 在call 爬蟲前將地點寫進sessionstorage，給 edit 回上一頁使用
    sessionStorage.setItem("lastSearchLocation", location);

    const fetchResults = async () => {
      setIsLoading(true);
      setError("");
      try {
        const res = await apiPost<any>("/api/search", { location, allow_scrape: allowScrape });
        
        if (res.status === 'completed' || res.status === 'blocked') {
          setTravelList(res.data);
          setIsExhausted(res.is_exhausted || false);
          setIsLoading(false);
          
          if (res.status === 'blocked') {
            toast.success("正在探索中，請稍候！", { duration: 8000, icon: '⏳' });
          }
          

        } else if (res.status === "processing") {
          // 紀錄爬蟲正在進行，用來判斷重新回到此頁要不要跑爬蟲！
          sessionStorage.setItem(`crawling_task_${location}`, res.task_id);
          
          startBackgroundPolling(res.task_id, location, () => {
            setError("搜尋失敗，請檢查輸入地點，或稍後再試");
            setIsLoading(false);
          });

          if (activeTripId) {
            toast.success("正在背景為您探索景點，先帶您前往行程編輯頁！", { duration: 8000, icon: '⏳' });
            router.push(`/edit/${activeTripId}`);
          } else {
            // 理論上不會發生
            toast.error("請先建立一個旅行計畫");
            router.push('/');
          }

        } else if (res.status === "failed") {
          setError("搜尋失敗，請檢查輸入地點，或稍後再試");
          setIsLoading(false);
        }
      } catch (err: any) {
        setError(err.message || "發生錯誤，請稍後再試");
        setIsLoading(false);
      }
    };

    fetchResults();
  }, [location, refreshKey, router, startBackgroundPolling, activeTripId]);


  const handleSearchMore = async () => {
    if (!location) return;
    
    if (taskState === 'polling') {
      toast.error(`目前已有任務進行中，請稍候！`,{ duration: 8000, icon: '⏳' });
      return;
    }

    try {
      const res = await apiPost<any>('/api/search-more', { location });
      
      if (res.status === 'failed') {
        toast.error(res.error || "此地點今日已無更多推薦景點。");
        setIsExhausted(true);
        return;
      }

      if (res.status === 'processing') {
        // 觸發全域等待，並且如果失敗，給予對應的 toast 提示
        startBackgroundPolling(res.task_id, location, () => {
          toast.error("發掘新景點失敗，請稍後再試");
        });
      }
    } catch (err) {
      toast.error("網路發生錯誤");
    }
  };


return (
    <main className="relative flex flex-1 w-full flex-col items-center justify-start pt-4 md:pt-8 pb-2 bg-gray-50 min-h-screen">
      
      {/* 根據不同狀態切換中間的內容 */}
      {isLoading ? (
        <div className="flex flex-1 w-full flex-col items-center justify-center px-6 text-center">
          <div className="h-10 w-10 md:h-12 md:w-12 rounded-full border-4 border-gray-300 border-t-blue-600 animate-spin mb-4" />
          <h2 className="text-xl md:text-2xl font-bold text-gray-800 mb-2 md:mb-3">
            正在為您探索「{location}」的全新景點
          </h2>
          <p className="text-gray-500 text-base md:text-lg max-w-2xl">
            您搜尋地點還沒有最新資料，這可能需要幾分鐘的時間，您可以先離開此頁面，完成時我們會通知您！
          </p>
        </div>
      ) : error ? (
        <div className="flex flex-1 w-full flex-col items-center justify-center px-4">
          <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center max-w-md w-full text-center hover:shadow-md transition-shadow">
            
            <div className="w-14 h-14 md:w-16 md:h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
              <svg className="w-7 h-7 md:w-8 md:h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <h3 className="text-lg md:text-xl font-bold text-gray-800 mb-2">哎呀，找不到景點</h3>
            <p className="text-gray-500 text-sm md:text-base mb-6 md:mb-8">{error}</p>

            <button 
              onClick={() => router.push("/")} 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 md:py-3 px-6 rounded-xl transition-colors shadow-sm active:scale-95 text-sm md:text-base"
            >
              回首頁重新搜尋
            </button>
          </div>
        </div>
      ) : travelList.length === 0 ? (
        <div className="flex flex-1 w-full flex-col items-center justify-center px-4">
          <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center max-w-md w-full text-center hover:shadow-md transition-shadow">
            
            <div className="w-14 h-14 md:w-16 md:h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-4 text-3xl">
              {taskState === 'polling' ? '⏳' : '📭'}
            </div>

            <h3 className="text-lg md:text-xl font-bold text-gray-800 mb-2">
              {taskState === 'polling' ? '系統正在探索其他城市' : '目前沒有景點資料'}
            </h3>
            
            <p className="text-gray-500 text-sm md:text-base mb-6 md:mb-8">
              {taskState === 'polling' 
                ? `資料庫中尚未有「${location}」的景點。由於系統正在背景執行其他任務，為避免資源衝突，請等待任務完成後再來發掘新城市！`
                : `我們目前找不到「${location}」的相關景點，請確認地名是否正確，或嘗試搜尋其他城市。`}
            </p>

            <button 
              onClick={() => router.push("/")} 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 md:py-3 px-6 rounded-xl transition-colors shadow-sm active:scale-95 text-sm md:text-base"
            >
              先回首頁逛逛
            </button>
          </div>
        </div>
      ) : (
        <ResultsSection
          destination={location || ""}
          travelList={travelList}
          responseMsg=""
          onSearchOther={(newLocation) => router.push(`/search?location=${newLocation}`)}
          scheduledIds={scheduledIds} 
          draftIds={ids}
          onAddToDraft={add}
          onRemoveFromDraft={remove}
          isExhausted={isExhausted}
          onSearchMore={handleSearchMore}
          isTaskPolling={taskState === 'polling'}
        />
      )}

      <AddPlacesToTripBtn/>
    </main>
  );
}


// 在檔案的最下方，新建一個預設輸出的元件，用 Suspense 把上面的 SearchContent 包起來
export default function SearchResultsPage() {
  return (
    // fallback 是在等待網址解析完成前，要先秀什麼畫面 (可以放一個簡單的轉圈圈)
    <Suspense fallback={
      <main className="flex flex-1 w-full flex-col items-center justify-center min-h-screen bg-gray-50">
        <div className="h-10 w-10 rounded-full border-4 border-gray-300 border-t-blue-600 animate-spin mb-4" />
        <p className="text-lg font-semibold text-gray-800">準備載入中...</p>
      </main>
    }>
      <SearchContent />  {/* 用 React 元件的方式呼叫*/}
    </Suspense>
  );
}

/* 
1. 衝突的起因：Next.js 的「印刷廠」機制
Next.js 為了讓網頁載入速度達到最快，在我們執行 npm run build（打包）時，它會試圖把你寫好的程式碼，提前全部「印」成靜態的 HTML 檔案（這稱為 Static Site Generation 或是靜態預渲染）。
這樣當使用者造訪網站時，伺服器不需要臨時運算，直接把印好的 HTML 丟給瀏覽器就好，速度極快。
2. 造成當機的罪魁禍首：useSearchParams
在你的旅遊網站專案中，你使用了 useSearchParams() 去抓取網址列的參數（例如 ?location=東京）。
這時矛盾就出現了：
印刷廠（Build 打包的當下）：網頁還在伺服器裡編譯，根本還沒有任何真實的使用者打開瀏覽器，也就絕對不可能有網址。
3. 解法：<Suspense> 發揮「延遲處理」
React 的 <Suspense> 元件，顧名思義就是「懸念、暫停」。把它包在會讀取網址的元件外面，等於是在對Next下達一個特別指令：
強迫把這塊畫面的渲染工作，從「伺服器端（預先打包）」延遲並移交給「客戶端（使用者的瀏覽器）」來執行。

*/