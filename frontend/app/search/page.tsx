"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiPost, apiGet } from "@/app/lib/api";
import ResultsSection from "@/app/components/home/ResultsSection";
import StartPlanningButton from "@/app/components/home/StartPlanningButton";
import { useTripDraft } from "@/app/hooks/useTripDraft";
import { useQuery } from "@tanstack/react-query";
import type { Attraction } from "@/app/types/all-types";
import { useTask } from "../context/TaskContext";


export default function SearchResultsPage() {
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