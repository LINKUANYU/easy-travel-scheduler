"use client";

import { motion } from "framer-motion";
import type { Attraction } from "@/app/types/all-types";
import { useState, useMemo, useEffect } from "react"; // 要在卡片內記住目前第幾張圖

type Props = {
  item: Attraction;
  index: number;
  inDraft: boolean;
  onToggleDraft: () => void;
  isScheduled: boolean
}


export default function AttractionCard({ item, index, inDraft, onToggleDraft, isScheduled }: Props){
  const images = item.images ?? []; // 確保 images 一定是陣列（沒有就用空陣列）

  // 將原始網址轉換為 Proxy API 網址，並加上 encodeURIComponent 確保網址格式安全
  const urls = useMemo(
    () => images
      .map((img) => img?.url)
      .filter(Boolean)
      .map((url) => `/api/image-proxy?url=${encodeURIComponent(url as string)}`), 
    [images]
  );
  
  const total = urls.length;
  const [imgIdx, setImgIdx] = useState(0);

  const [imgError, setImgError] = useState(false);

  const safeIdx = total > 0 ? ((imgIdx % total) + total) % total : 0; // 讓safeIdx 永遠在0~2，避免索引超出範圍

  const fallback = "/default-trip-cover.png"; // 拿圖失敗的畫面
  

  // 決定最終要顯示哪張圖。如果 imgError 是 true，就強制顯示 fallback
  const currentUrl = total > 0 ? urls[safeIdx] : fallback;
  const finalImageUrl = imgError ? fallback : currentUrl;

  const hasCarousel = total > 1; // 只有超過 1 張才顯示左右按鈕
  // 預載圖片 function 
  const preloadNextImage = () => {
    if (!hasCarousel || typeof window === "undefined") return;

    const preloadCount = 2
    for (let i = 1; i <= preloadCount; i++){
      const nextIdx = (safeIdx + i) % total;
      const img = new Image();  // 創造出一個 <img /> 標籤物件
      img.decoding = "async";  // 解析這張圖片的工作，請你用『非同步（async）』的方式在背景慢慢做就好。
      img.src = urls[nextIdx]; // 偷偷呼叫 Proxy API，讓後端去抓圖並塞入 Redis
    }
  };

  // 切換圖片function
  const prev = () => {
    if (!hasCarousel) return;
    setImgIdx((i) => (i - 1 + total) % total); // () => 表達式 會自動回傳
    setImgError(false); // 切換圖片時，重置破圖狀態，給新圖片一次機會
  };

  // i 代表「目前的 imgIdx 值」。
  // 因為你用的是 setImgIdx((i) => ...) 這種寫法，React 會把「更新前的 state」丟進來給你，這個參數我們通常命名成 i。
  // (i - 1 + total) % total ：先加１確保一定落在 0 ~ total-1

  const next = () => {
    if (!hasCarousel) return;
    setImgIdx((i) => (i + 1 + total) % total);
    setImgError(false); // 切換圖片時，重置破圖狀態，給新圖片一次機會
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, delay: index * 0.5 }}
      onMouseEnter={preloadNextImage}  // 滑鼠移入卡片範圍時，觸發預載
      className="bg-white rounded-xl shadow-lg overflow-hidden hover:scale-105 transition-transform duration-300 flex flex-col h-full"
    >
      <div className="relative bg-gray-100">
        <img
          src={finalImageUrl}
          alt={item.attraction}
          referrerPolicy="no-referrer"
          loading="lazy"  // 原生延遲載入，螢幕滑到才請求圖片
          onError={() => setImgError(true)}
          className="w-full h-60 object-cover"
        />
        {hasCarousel && (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 hover:bg-white shadow flex items-center justify-center"
              aria-label="上一張"
              >
              ‹
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 hover:bg-white shadow flex items-center justify-center"
              aria-label="下一張"
              >
              ›
            </button>
          </>
        )}
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
            {isScheduled ? "已在行程中" : inDraft ? "已加入" : "加入本次規劃"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}