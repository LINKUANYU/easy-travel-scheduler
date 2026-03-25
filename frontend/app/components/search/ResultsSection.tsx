"use client";

import { useState } from "react";
import type { Attraction } from "@/app/types/all-types";
import AttractionCard from "@/app/components/search/AttractionCard";
import type { DraftPlace } from "@/app/hooks/useTripDraft";


type Props = {
  destination: string;
  travelList: Attraction[];
  responseMsg?: string;
  onSearchOther: (location: string) => void;
  draftIds: Set<string>;
  onAddToDraft: (p: DraftPlace) => void;
  onRemoveFromDraft: (google_place_id: string) => void;
  scheduledIds: Set<string>;
};

export default function ResultsSection({
  destination, 
  travelList, 
  responseMsg,
  onSearchOther,
  draftIds,
  onAddToDraft,
  onRemoveFromDraft,
  scheduledIds,
}: Props){
  const [otherCity, setOtherCity] = useState("");

  const submitOther = () => {
    if (!otherCity) return;
    onSearchOther(otherCity);
  };

  return (
    <div className="w-full flex flex-col items-center px-6">
      {/* 頂部標題區區塊 */}
      <div className="w-full max-w-6xl flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
        <div className="flex-1">
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter mb-4">
            探索 {destination}
          </h1>
          <p className="text-slate-500 font-medium">
            為您精選的熱門景點，點擊「加入」即可開始規劃您的專屬行程。
          </p>
        </div>

        {/* 搜尋其他城市 - 膠囊風格 */}
        <div className="flex items-center bg-white border border-slate-200 rounded-full p-1.5 shadow-sm focus-within:ring-2 focus-within:ring-blue-100 transition-all w-full md:w-80">
          <input
            value={otherCity}
            onChange={(e) => setOtherCity(e.target.value)}
            placeholder="還想去別的城市嗎？"
            className="flex-1 px-4 py-2 bg-transparent outline-none text-sm text-slate-700 placeholder:text-slate-400"
          />
          <button
            onClick={submitOther}
            className="px-6 py-2 rounded-full bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition shadow-md"
          >
            搜尋
          </button>
        </div>
      </div>

      {/* 列表內容 */}
      {travelList.length === 0 ? (
        <div className="w-full max-w-6xl py-20 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
          <p className="text-slate-400 font-medium">{responseMsg ?? "目前沒有搜尋結果，換個城市試試？"}</p>
        </div>
      ) : (
        /* 調整 Gap 到 8 或 10，讓卡片陰影不重疊，視覺更乾淨 */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full max-w-6xl">
          {travelList.map((item, index) => {
            const gpid = item.google_place_id;
            const inDraft = gpid ? draftIds.has(gpid) : false;
            const isScheduled = gpid ? scheduledIds.has(gpid) : false; // 判斷是否已在資料庫行程中

            const onToggleDraft = () => {
              if (!gpid || isScheduled) return;
              if (inDraft) onRemoveFromDraft(gpid);
              else
                onAddToDraft({
                  google_place_id: gpid,
                  attraction: item.attraction,
                  city: item.city,
                  cover_url: item.images?.[0]?.url,
                });
            };

            return (
              <AttractionCard
                key={gpid ?? item.id}
                item={item}
                index={index}
                inDraft={inDraft}
                onToggleDraft={onToggleDraft}
                isScheduled={isScheduled}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

