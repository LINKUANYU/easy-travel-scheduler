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
    onSearchOther(otherCity);
  };

  return (
    <>
      <div className="w-full max-w-6xl flex items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold">
          最熱門 {destination} 的景點都在這裡，將喜愛的目的地加入您的旅行計畫
        </h1>

        <div className="flex items-center gap-2">
          <input
            value={otherCity}
            onChange={(e) => setOtherCity(e.target.value)}
            placeholder="搜尋其他城市..."
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white"
          />
          <button
            onClick={submitOther}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
          >
            搜尋
          </button>

        </div>
      </div>

      {travelList.length === 0 ? (
        <div className="w-full max-w-6xl text-gray-600">
          {responseMsg ?? "沒有結果"}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-6xl">
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
    </>
  )
}

