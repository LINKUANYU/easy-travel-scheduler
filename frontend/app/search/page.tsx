"use client";

import { useEffect, useState, useMemo, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiPost, apiGet } from "@/app/lib/api";
import ResultsSection from "@/app/components/search/ResultsSection";
import StartPlanningButton from "@/app/components/home/StartPlanningButton";
import { useTripDraft } from "@/app/hooks/useTripDraft";
import { useQuery } from "@tanstack/react-query";
import type { Attraction } from "@/app/types/all-types";
import { useTask } from "../context/TaskContext";


function SearchContent() {
  const searchParams = useSearchParams();
  const location = searchParams.get("location"); // 抓取網址上的 ?location= 值
  const router = useRouter();

  const { startBackgroundPolling } = useTask(); // 呼叫取得全域廣播

  const [travelList, setTravelList] = useState<Attraction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false); 
  const [error, setError] = useState("");

  const { ids, add, remove, activeTripId } = useTripDraft();

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

  // 當 location 改變時，自動發送請求要資料
  useEffect(() => {
    if (!location) {
      router.push("/"); // 沒帶參數就踢回首頁
      return;
    }

    // 如果這個地點已經發過請求了，就直接 return 阻止 Strict Mode 的第二次執行
    if (fetchedLocationRef.current === location) return;
    
    // 在發送請求前，把地點寫進紀錄本
    fetchedLocationRef.current = location;
    // 給編輯頁使用紀錄之前搜尋過的地點
    sessionStorage.setItem("lastSearchLocation", location);

    const fetchResults = async () => {
      setIsLoading(true);
      setIsProcessing(false); // 重置狀態
      try {
        const res = await apiPost<any>("/api/search", { location });
        
        if (res.status === "completed") {
          // 狀況 A：資料庫有現成資料
          setTravelList(res.data);

        } else if (res.status === "processing") {
          // 狀況 B：進入背景爬蟲，觸發全域輪詢，並切換畫面狀態
          setIsProcessing(true);
          startBackgroundPolling(res.task_id, location, () => {
            setIsProcessing(false);
            setError("搜尋失敗，請檢查輸入地點，或稍後再試");
          });

        } else if (res.status === "failed") {
          // 狀況 C：API 第一時間就判斷為失敗 (防呆)
          setError("搜尋失敗，請檢查輸入地點，或稍後再試");
        }
      } catch (err: any) {
        // 狀況 D：伺服器 500 錯誤、斷線等非預期的嚴重錯誤會跑來這裡
        setError(err.message || "發生錯誤，請稍後再試");
      } finally {
        setIsLoading(false);
      }
    };

    fetchResults();
  }, [location, router, startBackgroundPolling]);


return (
    <main className="relative flex flex-1 w-full flex-col items-center justify-start pt-8 pb-2 bg-gray-50 min-h-screen">
      
      {/* 根據不同狀態切換中間的內容 */}
      {isLoading ? (
        <div className="flex flex-1 w-full flex-col items-center justify-center">
          <div className="h-10 w-10 rounded-full border-4 border-gray-300 border-t-blue-600 animate-spin mb-4" />
          <p className="text-lg font-semibold text-gray-800">正在為您載入「{location}」的景點...</p>
        </div>
      ) : isProcessing ? (
        <div className="flex flex-1 w-full flex-col items-center justify-center px-4 text-center">
          <div className="h-12 w-12 rounded-full border-4 border-gray-300 border-t-blue-600 animate-spin mb-6" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">正在為您探索「{location}」的全新景點</h2>
          <p className="text-gray-500 text-lg">您搜尋地點還沒有最新資料，這可能需要幾分鐘的時間，您可以先離開此頁面，完成時我們會通知您！</p>
          <button onClick={() => router.push("/")} className="mt-8 bg-white border border-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-50 transition">
            先回首頁逛逛
          </button>
        </div>
      ) : error ? (
        <div className="flex flex-1 w-full flex-col items-center justify-center px-4">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center max-w-md w-full text-center hover:shadow-md transition-shadow">
            
            {/* 驚嘆號圖示 (使用 Tailwind 繪製 SVG) */}
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            {/* 標題與錯誤訊息 */}
            <h3 className="text-xl font-bold text-gray-800 mb-2">哎呀，找不到景點</h3>
            <p className="text-gray-500 text-base mb-8">{error}</p>

            {/* 現代化實體按鈕 */}
            <button 
              onClick={() => router.push("/")} 
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 rounded-xl transition-colors shadow-sm active:scale-95"
            >
              回首頁重新搜尋
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
        />
      )}

      <StartPlanningButton/>
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