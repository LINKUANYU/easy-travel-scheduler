// app/components/home/PopularSearches.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/app/lib/api";

type Props = {
  // 當使用者點擊城市時，把城市名稱往上傳
  onSelect: (city: string) => void; 
};

export default function PopularSearches({ onSelect }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["popular-searches"],
    queryFn: async () => {
      // 根據後端寫的回傳格式 {"status": "success", "data": ["東京", ...]}
      const res = await apiGet<{ status: string; data: string[] }>("/api/popular-searches");
      return res.data;
    },
    // 設定 staleTime 瀏覽器快取，避免頻繁切換頁面時重複發 Request
    staleTime: 1000 * 60 * 60, 
  });

  // 如果正在載入、發生錯誤，或是沒資料，就給一個固定高度的空白，防止畫面跳動
  if (isLoading || error || !data || data.length === 0) {
    return <div className="h-8 mt-6"></div>; 
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2 mt-6 animate-fade-in">
      <span className="text-sm font-semibold text-slate-700 mr-1 tracking-wide">
        熱門搜尋：
      </span>
      {data.map((city) => (
        <button
          key={city}
          onClick={() => onSelect(city)}
          // 套用半透明玻璃質感的膠囊按鈕，Hover 時變成主色調
          className="px-4 py-1.5 text-sm font-medium text-slate-600 bg-white/50 hover:bg-blue-100 hover:text-blue-700 rounded-full border border-white/60 shadow-sm transition-all duration-200"
        >
          {city}
        </button>
      ))}
    </div>
  );
}