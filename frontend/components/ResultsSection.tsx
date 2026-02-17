"use client";

import type { Attraction } from "@/types/attraction";
import AttractionCard from "@/components/AttractionCard";

type Props = {
    destination: string;
    travelList: Attraction[];
    onReset: () => void
};

export default function ResultsSection({ destination, travelList, onReset }: Props){
  return (
    <>
      <div className="w-full max-w-6xl flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">
          最熱門 {destination} 的景點都在這裡，將喜愛的目的地加入您的旅行計畫
        </h1>

        <button
          onClick={onReset}
          className="ml-4 px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition"
        >
          重新搜尋
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-6xl">
        {travelList.map((item, index) => (
          <AttractionCard key={item.id} item={item} index={index} />
        ))}
      </div>
    </>
  )
}

