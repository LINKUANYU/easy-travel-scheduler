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
  const urls = useMemo(
    () => images.map((img) => img?.url).filter(Boolean) as string[], // 裡面先做.map()如果u存在就拿u.url建立新的陣列，然後再filter，最後告訴TS 這是一個字串陣列
    [images]
  ); // useMemo(..., [images]) 只有在[images]改變時才重新執行
  
  const total = urls.length;
  const [imgIdx, setImgIdx] = useState(0); // 0 是 初始值（第一次 render 時，imgIdx 從 0 開始）

  const safeIdx = total > 0 ? ((imgIdx % total) + total) % total : 0; // 讓safeIdx 永遠在0~2，避免索引超出範圍

  const fallback = "/default-trip-cover.png"; // 拿圖失敗的畫面
  const imageUrl = total > 0 ? urls[safeIdx] : fallback; // 改用 safeIdx 取圖

  const hasCarousel = total > 1; // 只有超過 1 張才顯示左右按鈕

  // 圖片預載功能
  useEffect(() => {  // useEffect 代表：React render 完成、DOM 更新後才會執行這段副作用程式碼。
    if (typeof window === "undefined") return; // 如果目前不是在瀏覽器（而是在伺服器）就不要跑預載，避免 SSR 報錯。
    if (!hasCarousel) return;

    const preload = (u?:string) => { // u?:string 可選參數代表 u 只能是字串或是undefined 
      if (!u) return; // 避免 url 是 undefined/null 時出錯。
      const img = new Image(); // 瀏覽器原生 API：建立一個「看不見的圖片物件」。
      img.decoding = "async"; // 只是告訴瀏覽器：圖片解碼盡量不要卡住主執行緒（有幫助但不是核心）。
      img.src = u
    };
    // 一旦你指定 src，瀏覽器就會開始下載圖片。
    // 下載完成後，圖片通常會進入瀏覽器的 HTTP cache。
    // 之後你 <img src="同一個url">，就能直接用 cache 快速顯示。

    // 算出前後張
    const nextIdx = (safeIdx + 1) % total;
    const prevIdx = (safeIdx - 1 + total) % total;
    
    // 執行預載
    preload(urls[nextIdx]);
    preload(urls[prevIdx]);

  }, [safeIdx, total, hasCarousel, urls]) // dependencies 陣列：當這些值其中任何一個改變時，這段 effect 會再跑一次。
  // 切換圖片時safeIdx 變動，跑一次預載

  // 切換圖片function
  const prev = () => {
    if (!hasCarousel) return;
    setImgIdx((i) => (i - 1 + total) % total); // () => 表達式 會自動回傳
  };
  // i 代表「目前的 imgIdx 值」。
  // 因為你用的是 setImgIdx((i) => ...) 這種寫法，React 會把「更新前的 state」丟進來給你，這個參數我們通常命名成 i。
  // (i - 1 + total) % total ：先加１確保一定落在 0 ~ total-1
  const next = () => {
    if (!hasCarousel) return;
    setImgIdx((i) => (i + 1 + total) % total);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, delay: index * 0.5 }}
      className="bg-white rounded-xl shadow-lg overflow-hidden hover:scale-105 transition-transform duration-300"
    >
      <div className="relative">
        <img
          src={imageUrl}
          alt={item.attraction}
          referrerPolicy="no-referrer"
          className="w-full h-48 object-cover"
        />
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
      </div>


      <div className="p-5">
        <h3 className="text-xl font-bold text-gray-800 mb-2">{item.attraction}</h3>
        <p className="text-gray-600 text-sm leading-relaxed">{item.description}</p>

        <div className="flex items-center justify-between pt-4 mt-2">
          <div className="text-xs font-medium px-2 py-1 bg-blue-50 text-blue-600 rounded-full">
            📍 {item.geo_tags}
          </div>
          <button 
            className={`text-sm font-bold transition-colors flex items-center gap-1 ${
              isScheduled
                ? "text-gray-400 cursor-not-allowed" // 已在行程中：變灰色，禁止手標
                : "text-blue-600 hover:text-blue-800" // 正常狀態：藍色
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