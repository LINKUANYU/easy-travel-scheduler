"use client"; // 告訴 Next.js 這是在瀏覽器執行的元件

import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import SearchPanel from "@/app/components/home/SearchPanel";
import { apiGet } from "@/app/lib/api";
import { useRouter } from "next/navigation";
import StartPlanningButton from "./components/home/StartPlanningButton";


import toast from "react-hot-toast";
import ExploreTripCard from "./components/home/ExploreTripCard";

export default function Home(){
  const router = useRouter();

  const [destinationInput, setDestinationInput] = useState<string>(""); // 給 input 用

  // ==========================================
  // 抓取首頁下方「探索熱門行程」
  // ==========================================
  const exploreTripsQ = useQuery({
    queryKey: ["exploreTrips"],
    queryFn: async () => apiGet<any[]>("/api/explore/trips"),
  });


  // ==========================================
  // 搜尋按鈕邏輯
  // ==========================================
  const handleSearch = (location: string) => {
    if (!location.trim()) return toast.error("請輸入地點");
    router.push(`/search?location=${location}`);
  };

  return (
    <main className="relative flex flex-1 w-full flex-col items-center justify-start pt-8 pb-2 bg-gray-50">      
      <div className="w-full max-w-5xl px-4 flex flex-col items-center">
        
        {/* 上半部：搜尋框 */}
        <div className="w-full max-w-2xl mb-16">
          <SearchPanel
            destination={destinationInput}
            onDestinationChange={setDestinationInput}
            onSearch={() => handleSearch(destinationInput)}
          />
        </div>

        {/* 下半部：熱門行程推薦 */}
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
              {exploreTripsQ.data?.map((trip) => (
                <ExploreTripCard key={trip.trip_id} trip={trip} />
              ))}
            </div>
          )}
        </div>
        
        <StartPlanningButton/>
      </div>
    </main>
  );
}