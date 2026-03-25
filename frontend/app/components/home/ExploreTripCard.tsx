"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

export default function ExploreTripCard({ trip }: { trip: any }) {
  // 1. 解析圖片 JSON (與 Dashboard 寫的邏輯一樣)
  const urls = useMemo<string[]>(() => {
    if (!trip.cover_url) return [];
    try {
      const parsed = JSON.parse(trip.cover_url);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [trip.cover_url]);

  const [imgIndex, setImgIndex] = useState(0);

  const currentImageSrc = imgIndex < urls.length 
    ? urls[imgIndex] 
    : "/default-trip-cover.png";

  return (
    <Link href={`/share/${trip.share_token}`} className="block group">
      {/* 卡片主容器 - 設定大圓角、陰影與 overflow-hidden */}
      <div className="relative rounded-[2rem] overflow-hidden transition-all duration-500 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.1)]  flex flex-col h-[200px]">
        
        {/* 1. 圖片容器 - 佔滿整個卡片高度 */}
        <div className="absolute inset-0 w-full h-full bg-slate-100 overflow-hidden">
          <img 
            src={currentImageSrc} 
            alt={trip.title}
            className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110" 
            onError={() => {
              if (imgIndex < urls.length) {
                setImgIndex((prev) => prev + 1);
              }
            }}
          />
          
          {/* 2. 漸層遮罩 (Gradient Overlay) - 確保文字清晰的核心 */}
          {/* 從透明 (to-transparent) 漸變到半透明黑 (from-black/70) */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent z-10" />
        </div>

        {/* 3. 行程資訊區塊 - 定位在左下角 */}
        <div className="absolute bottom-0 left-0 w-full p-4 z-20 flex flex-col gap-3">
          
          {/* 行程標題 - 使用白色 text-white，並加大字重 */}
          <h3 className="font-extrabold text-white text-2xl truncate tracking-tight group-hover:text-blue-200 transition-colors duration-300">
            {trip.title}
          </h3>
          
          {/* 行程詳情 (天數 & 日期) */}
          <div className="flex items-center gap-3">
            {/* 天數標籤 - 修改為適合圖片上方的樣式 */}
            <span className="text-[11px] font-black text-white bg-white/20 px-3 py-1 rounded-full uppercase tracking-wider backdrop-blur-sm">
              {trip.days} Days
            </span>
            
            {/* 日期 - 使用淡灰色 text-slate-200，與標題區分 */}
            <span className="text-xs font-medium text-slate-200">
              {trip.start_date || "尚未設定日期"}
            </span>
          </div>
        </div>

      </div>
    </Link>
  );
}