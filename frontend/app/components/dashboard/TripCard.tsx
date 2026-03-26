"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Button from "../ui/Button";

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
  // 解析 JSON 圖片陣列
  const urls = useMemo<string[]>(() => {
    if (!trip.cover_url) return [];
    try {
      const parsed = JSON.parse(trip.cover_url);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [trip.cover_url]);

  // 狀態管理：目前嘗試到第幾張圖片
  const [imgIndex, setImgIndex] = useState(0);

  // 決定當前圖片來源
  const currentImageSrc = imgIndex < urls.length 
    ? urls[imgIndex] 
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
