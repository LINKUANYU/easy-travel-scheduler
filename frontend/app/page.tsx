"use client"; // 告訴 Next.js 這是在瀏覽器執行的元件

import { useState, useEffect } from "react";
import type { Attraction } from "@/types/attraction";
import SearchPanel from "@/components/SearchPanel";
import ResultsSection from "@/components/ResultsSection";
import AuthCorner from "@/components/AuthCorner";
import StartPlanningButton from "@/components/StartPlanningButton";

// ✅ 新增：把 draft 放在 page 當 single source
import { useTripDraft } from "@/hooks/useTripDraft";
// ✅ 之後你要放右下角開始規劃按鈕，就在這裡 render
// import StartPlanningButton from "@/components/StartPlanningButton";

type SearchResponse = {
  data?: Attraction[];
  message?: string;
};

export default function Home(){
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  
  const [mode, setMode] = useState<"search" | "results">("search");

  const [destinationInput, setDestinationInput] = useState<string>(""); // 給 input 用
  const [currentDestination, setCurrentDestination] = useState<string>(""); // 給標題用

  const [responseMsg, setResponseMsg] = useState<string>("");
  const [travelList, setTravelList] = useState<Attraction[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // ✅ single source of truth
  const { ids, add, remove, draft, clear } = useTripDraft();

  const handleSearch = async (location: string) => {
    if (!location.trim()) return alert("請輸入地點");

    setLoading(true);
    setResponseMsg("");

    try{
      const response = await fetch("http://localhost:8000/api/search", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({ location: location})
      });

      const data: SearchResponse = await response.json();
      
      setCurrentDestination(location);   // ✅ 更新標題城市
      setMode("results");                // ✅ 不管有沒有結果，都進 results 模式

      if (Array.isArray(data.data) && data.data.length > 0){
        setTravelList(data.data);   // ✅ 用新結果覆蓋舊結果
      }else{
        setTravelList([]);    // ✅ 沒結果就清空顯示
        setResponseMsg(data.message ?? "沒有找到資料");
      }
    }catch(err){
      console.error("Error", err);
      setMode("results");
      setTravelList([]);
      setResponseMsg("伺服器發生錯誤，請稍後再試");
    }finally{
      setLoading(false);
    }

  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-24 bg-gray-100">
      {/* 暫時先把會員系統拿掉
      <AuthCorner/> 
      */}
      
      {loading ? (
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
          loading={loading}
          responseMsg={responseMsg}
        />
      ) : (
        <ResultsSection
          destination={currentDestination}
          travelList={travelList}
          responseMsg={responseMsg}
          onSearchOther={handleSearch}    // ✅ 給 Results 內的「搜尋其他城市」用
          draftIds={ids}
          onAddToDraft={add}
          onRemoveFromDraft={remove}
        />
      )}

      {mounted && (
        <StartPlanningButton
          draft={draft}
          onCreated={clear}
        />
      )}
    </main>
  );

}





