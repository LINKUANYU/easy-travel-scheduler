"use client"; // 告訴 Next.js 這是在瀏覽器執行的元件

import { useState, useEffect, } from "react";
import { useMutation } from "@tanstack/react-query";
import type { Attraction } from "@/types/all-types";
import SearchPanel from "@/components/SearchPanel";
import ResultsSection from "@/components/ResultsSection";
import AuthCorner from "@/components/AuthCorner";
import StartPlanningButton from "@/components/StartPlanningButton";
import { apiPost } from "@/lib/api";

// ✅ 新增：把 draft 放在 page 當 single source
import { useTripDraft } from "@/hooks/useTripDraft";
// ✅ 之後你要放右下角開始規劃按鈕，就在這裡 render
// import StartPlanningButton from "@/components/StartPlanningButton";

type SearchResponse = Attraction[];

export default function Home(){
  const [mode, setMode] = useState<"search" | "results">("search");

  const [destinationInput, setDestinationInput] = useState<string>(""); // 給 input 用
  const [currentDestination, setCurrentDestination] = useState<string>(""); // 給標題用

  const [responseMsg, setResponseMsg] = useState<string>("");
  const [travelList, setTravelList] = useState<Attraction[]>([]);

  // ✅ single source of truth
  const { ids, add, remove, draft, clear } = useTripDraft();

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
    if (!location.trim()) return alert("請輸入地點");
    mutation.mutate(location)

  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-24 bg-gray-100">
      {/* 暫時先把會員系統拿掉
      <AuthCorner/> 
      */}
      
      {mutation.isPending ? (
        <div className="bg-white p-8 rounded-lg shadow-md">
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="h-10 w-10 rounded-full border-4 border-gray-300 border-t-blue-600 animate-spin" />
            <p className="text-lg font-semibold text-gray-800">正在搜尋地點中...</p>
          </div>
        </div>
      ) : mode === "search" ? (
        <SearchPanel
          destination={destinationInput}
          onDestinationChange={setDestinationInput}
          onSearch={() => handleSearch(destinationInput)}
          loading={mutation.isPending}
          responseMsg={responseMsg}
        />
      ) : (
        <>
          <ResultsSection
            destination={currentDestination}
            travelList={travelList}
            responseMsg={responseMsg}
            onSearchOther={handleSearch}    // ✅ 給 Results 內的「搜尋其他城市」用
            draftIds={ids}
            onAddToDraft={add}
            onRemoveFromDraft={remove}
          />
          <StartPlanningButton
            draft={draft}
            onCreated={clear}
          />
        </>
      )}

    </main>
  );

}





