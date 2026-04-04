"use client";

import { motion } from "framer-motion";
import type { Attraction } from "@/app/types/all-types";
import { useState, useMemo, useEffect } from "react"; // 要在卡片內記住目前第幾張圖
import { fetchPlaceThumb } from "@/app/lib/edit/placeThumb";
import { useQuery } from "@tanstack/react-query";

type Props = {
  item: Attraction;
  index: number;
  inDraft: boolean;
  onToggleDraft: () => void;
  isScheduled: boolean
}


export default function AttractionCard({ item, index, inDraft, onToggleDraft, isScheduled }: Props){
  const [imgError, setImgError] = useState(false);
  const fallback = "/default-trip-cover.png"; // 拿圖失敗的畫面

  // queryKey 設為 ["placeThumb", placeId]，這樣就能跟 Edit 頁面完美共用快取！
  const { data: thumbData, isLoading } = useQuery({
    queryKey: ["placeThumb", item.google_place_id],
    queryFn: () => fetchPlaceThumb(item.google_place_id),
    staleTime: 1000 * 60 * 60 * 24 * 7, // 快取一週
    enabled: !!item.google_place_id,
  });


  // 決定最終圖片 URL：如果還在載入中或沒有圖片，就先用 fallback
  const currentUrl = thumbData?.url || fallback;
  const finalImageUrl = imgError ? fallback : currentUrl;
  

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, delay: index * 0.5 }}
      className="bg-white rounded-xl shadow-lg overflow-hidden hover:scale-105 transition-transform duration-300 flex flex-col h-full"
    >
      <div className="relative bg-gray-100">
        {/* 如果正在載入圖片，可以加一個簡單的骨架屏效果 (選用) */}
        {isLoading && (
          <div className="absolute inset-0 bg-gray-200 animate-pulse flex items-center justify-center">
            <span className="text-gray-400 text-sm">載入圖片中...</span>
          </div>
        )}
        <img
          src={finalImageUrl}
          alt={item.attraction}
          loading="lazy"
          onError={() => setImgError(true)}
          className={`w-full h-60 object-cover transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
        />
      </div>


      <div className="p-5 flex flex-col flex-1">
        <h3 className="text-xl font-bold text-gray-800 mb-2 truncate">
          {item.attraction}
        </h3>
        
        {/* 描述文字：使用 line-clamp 限制行數可讓視覺更整齊 */}
        <p className="text-gray-600 text-sm leading-relaxed line-clamp-3 mb-4">
          {item.description}
        </p>
        
        {/* 靠著底部 */}
        <div className="flex items-center justify-between pt-4 mt-auto border-t border-gray-50">
          <div className="text-xs font-medium px-2 py-1 bg-blue-50 text-blue-600 rounded-full">
            📍 {item.geo_tags}
          </div>
          <button 
            className={`text-xs font-semibold rounded-full px-3 py-1 flex items-center gap-1.5 transition-all duration-200 border ${
              isScheduled
                ? "bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed"
                : inDraft
                ? "bg-white text-blue-600 border-blue-600 hover:bg-blue-50"
                : "bg-blue-600 text-white border-blue-600 hover:bg-blue-700 shadow-md"
            }`}
            type="button"
            onClick={isScheduled ? undefined : onToggleDraft} // 已在行程中則不綁定點擊事件
            disabled={isScheduled} // 停用按鈕
          >
            {isScheduled ? "已在行程中" : inDraft ? "已加入" : "加入＋"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}