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
    // 整張卡片包在 Link 裡面，點擊任一處都會跳轉
    <Link href={`/share/${trip.share_token}`} className="block group">
      <div className="border border-gray-200 rounded-xl shadow-sm hover:shadow-xl transition-all duration-300 bg-white flex flex-col h-[240px] overflow-hidden">
        
        {/* 上半部：封面圖片 (加上 group-hover:scale-105 讓游標移上去時圖片會微微放大) */}
        <div className="relative w-full h-36 bg-gray-100 overflow-hidden">
          <img 
            src={currentImageSrc} 
            alt={trip.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
            onError={() => {
              if (imgIndex < urls.length) {
                setImgIndex((prev) => prev + 1);
              }
            }}
          />
        </div>

        {/* 下半部：行程資訊 */}
        <div className="p-4 flex flex-col flex-1">
          <div className="font-bold text-lg mb-1 truncate group-hover:text-blue-600 transition-colors">
            {trip.title}
          </div>
          <div className="text-sm text-gray-500 flex items-center mt-auto">
            <span className="bg-gray-100 px-2 py-1 rounded mr-2 font-medium">{trip.days} 天</span>
            {trip.start_date && <span>出發日: {trip.start_date}</span>}
          </div>
        </div>

      </div>
    </Link>
  );
}