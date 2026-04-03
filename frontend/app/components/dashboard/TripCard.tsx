"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { fetchPlaceThumb } from "@/app/lib/edit/placeThumb";
import { useQuery } from "@tanstack/react-query";
// ==========================================
// 1. 獨立出來的單一卡片元件 (負責自己的圖片容錯與渲染)
// ==========================================
export default function TripCard({ 
  trip, 
  onDelete, 
  isDeleting 
}: { 
  trip: any; 
  onDelete: () => void; 
  isDeleting: boolean; 
}) {
  // 1. 嘗試解析舊有的/自訂的 cover_url(保留未來新增給上傳封面功能)
  const urls = useMemo<string[]>(() => {
    if (!trip.cover_url) return [];
    try {
      const parsed = JSON.parse(trip.cover_url);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [trip.cover_url]; // 如果不是 JSON 就當作一般網址
    }
  }, [trip.cover_url]);

  // 狀態管理：目前嘗試到第幾張圖片
  const [imgIndex, setImgIndex] = useState(0);

  // 透過 first_place_id 向 Google 拿圖片 (結合 Session Storage 快取)
  const { data: thumb } = useQuery({
    queryKey: ["placeThumb", trip.first_place_id],
    queryFn: () => fetchPlaceThumb(trip.first_place_id),
    enabled: !!trip.first_place_id, // 只有在有 place_id 的情況下才發出請求
    staleTime: Infinity, // 照片不常變動，盡量不重抓
  });

  // 決定最終要顯示的圖片來源 (資料庫圖片庫 -> Google 圖 -> 預設圖)
  const currentImageSrc = urls.length > 0 && imgIndex < urls.length
    ? urls[imgIndex] 
    : thumb?.url 
    ? thumb.url 
    : "/default-trip-cover.png";

  return (
    // overflow-hidden 讓頂部圖片可以完美貼合卡片的圓角
    <li className="border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition bg-white flex flex-col min-h-[300px] overflow-hidden">
      
      {/* 上半部：封面圖片 */}
      <div className="relative w-full h-48 bg-gray-100">
        <img 
          src={currentImageSrc} 
          alt={trip.title}
          className="w-full h-full object-cover" 
          onError={() => {
            // 容錯機制：載入失敗就換下一張，都失敗就退回本地預設圖
            if (imgIndex < urls.length) {
              setImgIndex((prev) => prev + 1);
            }
          }}
        />
      </div>

      {/* 下半部：文字與按鈕 (補上 padding) */}
      <div className="p-5 flex flex-col flex-1">
        <div className="font-bold text-xl mb-2 truncate">{trip.title}</div>
        <div className="text-sm text-gray-500 mb-6 flex items-center">
          <span className="bg-gray-100 px-2 py-1 rounded mr-2">{trip.days} 天</span>
          {trip.start_date && <span>出發日: {trip.start_date}</span>}
        </div>
        
        {/* 按鈕操作區塊 (置底) */}
        <div className="mt-auto flex gap-2 pt-4 border-t border-gray-100">
          <Link 
            href={`/edit/${trip.trip_id}`} 
            className="flex-1 text-center bg-blue-50 text-blue-600 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 transition"
          >
            編輯
          </Link>
          
          {trip.share_token ? (
            <Link 
              href={`/share/${trip.share_token}`} 
              className="flex-1 text-center bg-gray-50 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 transition"
            >
              查看
            </Link>
          ) : (
            <button 
              onClick={() => alert("還沒有儲存的行程")}
              className="flex-1 text-center bg-gray-50 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 transition"
            >
              查看
            </button>
          )}
          
          <button 
            onClick={onDelete}
            disabled={isDeleting}
            className="flex-1 text-center bg-red-50 text-red-600 py-2 rounded-lg text-sm font-medium hover:bg-red-100 transition disabled:opacity-50"
          >
            {isDeleting ? "刪除中..." : "刪除"}
          </button>
        </div>
      </div>
    </li>
  );
}
