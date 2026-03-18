"use client"; // 告訴 Next.js 這是在瀏覽器執行的元件

import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Attraction } from "@/app/types/all-types";
import SearchPanel from "@/app/components/home/SearchPanel";
import ResultsSection from "@/app/components/home/ResultsSection";
import StartPlanningButton from "@/app/components/home/StartPlanningButton";
import { apiPost, apiGet } from "@/app/lib/api";

// 把 draft 放在 page 當 single source
import { useTripDraft } from "@/app/hooks/useTripDraft";
import toast from "react-hot-toast";
import ExploreTripCard from "./components/home/ExploreTripCard";

type SearchResponse = Attraction[];

export default function Home(){
  const [mode, setMode] = useState<"search" | "results">("search");

  const [destinationInput, setDestinationInput] = useState<string>(""); // 給 input 用
  const [currentDestination, setCurrentDestination] = useState<string>(""); // 給標題用

  const [responseMsg, setResponseMsg] = useState<string>("");
  const [travelList, setTravelList] = useState<Attraction[]>([]);

  const { ids, add, remove, draft, clear, activeTripId } = useTripDraft();

  // 🌟 新增一個用來控制「初始確認中」的短暫 Loading 狀態
  const [isInitialLoading, setIsInitialLoading] = useState(false);

  // 🌟 1. 新增：用來鎖死畫面的 isPolling 狀態
  const [isPolling, setIsPolling] = useState(false);
  
  // 🌟 2. 新增：用來記錄計時器 ID 的 ref
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 當使用者離開此頁面(Unmount)時，自動清除計時器，防止 Memory Leak
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);


  // ==========================================
  // 去後端抓取「目前行程已有的景點」
  // ==========================================
  const activeTripPlacesQ = useQuery({
    queryKey: ["activeTripPlaces", activeTripId],
    enabled: activeTripId !== null, // 只有在有活躍行程時才發送 API
    queryFn: async () => apiGet<any[]>(`/api/trips/${activeTripId}/places`),
  });

  // 將抓回來的景點 ID 轉換成 Set，方便快速比對
  const scheduledIds = useMemo(() => {
    const set = new Set<string>();
    if (activeTripPlacesQ.data) {
      activeTripPlacesQ.data.forEach((p: any) => {
        if (p.google_place_id) set.add(p.google_place_id);
      });
    }
    return set;
  }, [activeTripPlacesQ.data]);

  // ==========================================
  // 抓取首頁下方「探索熱門行程」
  // ==========================================
  const exploreTripsQ = useQuery({
    queryKey: ["exploreTrips"],
    queryFn: async () => apiGet<any[]>("/api/explore/trips"),
  });


  // ==========================================
  // 輪詢檢查 Celery 任務狀態的機制
  // ==========================================
  const pollTaskStatus = (taskId: string, location: string) => {
    setIsPolling(true); // 🌟 開始輪詢，鎖死畫面

    // 🌟 將計時器存入 Ref 中
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const statusRes = await apiGet<any>(`/api/search/status/${taskId}`);
        
        if (statusRes.status === "completed") {
          clearInterval(pollingIntervalRef.current!); // 🌟 清除計時器
          setIsPolling(false); // 🌟 解除鎖定
          
          const finalRes = await apiPost<any>("/api/search", { location });
          
          setCurrentDestination(location);
          setTravelList(finalRes.data);
          setMode("results");
          setResponseMsg("");
          toast.success(`「${location}」的景點探索完成！為您顯示結果。`, { duration: 4000 });
          
        } else if (statusRes.status === "failed") {
          clearInterval(pollingIntervalRef.current!); // 🌟 清除計時器
          setIsPolling(false); // 🌟 解除鎖定
          toast.error("背景爬蟲任務失敗，請稍後再試");
        }
      } catch (err) {
        clearInterval(pollingIntervalRef.current!);
        setIsPolling(false);
        console.error(err);
      }
    }, 3000); 
  };

  // ==========================================
  // 搜尋邏輯 (處理號碼牌)
  // ==========================================
  const handleSearch = async (location: string) => {
    if (!location.trim()) return toast.error("請輸入地點");
    
    setIsInitialLoading(true); // 打開短暫的 Loading，去問後端有沒有現成資料
    
    try {
      const res = await apiPost<any>("/api/search", { location });
      
      if (res.status === "completed") {
        // 資料庫有資料，秒回，直接顯示結果
        setCurrentDestination(location);
        setTravelList(res.data);
        setMode("results");
        setResponseMsg("");
        setIsInitialLoading(false); 
        
      } else if (res.status === "processing") {
        // ⚠️ 關鍵：後端要爬蟲，「立刻關閉 Loading」，讓畫面回到首頁！
        setIsInitialLoading(false); 
        
        // 跳出友善的長時間提示
        toast("您搜尋的景點還沒有人去過，可能會花一點時間，建議您可以直接開始規劃行程或是參考其他行程", { 
          icon: '⏳',
          duration: 6000 // 顯示 6 秒，讓使用者有時間看完
        });
        
        // 將號碼牌交給背景去輪詢，這行不會阻擋接下來的任何操作
        pollTaskStatus(res.task_id, location);
      }
    } catch (err: any) {
      setIsInitialLoading(false);
      console.error("搜尋發生錯誤", err);
      setMode("search");
      setTravelList([]);
      setDestinationInput("");
      setResponseMsg(err.message || "連線失敗，請稍後再試");
    }
  };


  return (
    <main className="relative flex flex-1 w-full flex-col items-center justify-start pt-8 pb-2 bg-gray-50">      

      {/* 🌟 替換成 isInitialLoading */}
      {isInitialLoading ? (
        <div className="bg-white p-8 rounded-lg shadow-md mt-10">
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="h-10 w-10 rounded-full border-4 border-gray-300 border-t-blue-600 animate-spin" />
            <p className="text-lg font-semibold text-gray-800">正在確認資料庫...</p>
          </div>
        </div>
      ) : mode === "search" ? (
        <div className="w-full max-w-5xl px-4 flex flex-col items-center">
          
          <div className="w-full max-w-2xl mb-16">
            <SearchPanel
              destination={destinationInput}
              onDestinationChange={setDestinationInput}
              onSearch={() => handleSearch(destinationInput)}
              loading={isInitialLoading}
              responseMsg={responseMsg}
              isPolling={isPolling}
            />
          </div>

          {/* 下方：探索別人的行程 */}
          <div className="w-full">
            <div className="flex items-center mb-6">
              <h2 className="text-2xl font-black text-gray-800 border-l-4 border-blue-500 pl-3">
                熱門行程推薦
              </h2>
            </div>
            
            {exploreTripsQ.isLoading ? (
              <p className="text-gray-500">載入熱門行程中...</p>
            ) : exploreTripsQ.isError ? (
              <p className="text-red-500">無法載入熱門行程</p>
            ) : exploreTripsQ.data?.length === 0 ? (
              <p className="text-gray-500">目前還沒有公開的行程喔！</p>
            ) : (
              // 6 宮格的排版
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                {exploreTripsQ.data?.map((trip) => (
                  <ExploreTripCard key={trip.trip_id} trip={trip} />
                ))}
              </div>
            )}
          </div>

        </div>
      ) : (
        <>
          <ResultsSection
            destination={currentDestination}
            travelList={travelList}
            responseMsg={responseMsg}
            onSearchOther={handleSearch}    // ✅ 給 Results 內的「搜尋其他城市」用
            scheduledIds={scheduledIds} //  把既有清單傳遞下去
            draftIds={ids}
            onAddToDraft={add}
            onRemoveFromDraft={remove}
          />
          
        </>
      )}

      <StartPlanningButton/>

    </main>
  );

}





