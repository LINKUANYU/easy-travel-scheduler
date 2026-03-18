"use client"; // 告訴 Next.js 這是在瀏覽器執行的元件

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { Attraction } from "@/app/types/all-types";
import SearchPanel from "@/app/components/home/SearchPanel";
import ResultsSection from "@/app/components/home/ResultsSection";
import StartPlanningButton from "@/app/components/home/StartPlanningButton";
import { apiPost, apiGet } from "@/app/lib/api";
import { useMemo } from "react";

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


  const mutation = useMutation({
    mutationFn: (location: string) =>
      apiPost<SearchResponse>("/api/search", {location}),
    onSuccess: (data, location) => {
      setCurrentDestination(location);
      setTravelList(data);
      setMode("results");
      setResponseMsg("");
    },
    onError: (err: any) => {
      console.error("搜尋發生錯誤", err);
      setMode("search");
      setTravelList([]);
      setDestinationInput("");
      setResponseMsg(err.message || "連線失敗，請稍後再試");
    }
  });

  const handleSearch = async (location: string) => {
    if (!location.trim()) return toast.error("請輸入地點");
    mutation.mutate(location)

  }

  return (
    <main className="relative flex flex-1 w-full flex-col items-center justify-start pt-8 pb-2 bg-gray-50">      

      {mutation.isPending ? (
        <div className="bg-white p-8 rounded-lg shadow-md">
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="h-10 w-10 rounded-full border-4 border-gray-300 border-t-blue-600 animate-spin" />
            <p className="text-lg font-semibold text-gray-800">正在搜尋地點中...</p>
          </div>
        </div>
      ) : mode === "search" ? (
        <div className="w-full max-w-5xl px-4 flex flex-col items-center">
          
          <div className="w-full max-w-2xl mb-4">
            <SearchPanel
              destination={destinationInput}
              onDestinationChange={setDestinationInput}
              onSearch={() => handleSearch(destinationInput)}
              loading={mutation.isPending}
              responseMsg={responseMsg}
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





