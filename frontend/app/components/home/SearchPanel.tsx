"use client";
import { burstConfetti } from "@/app/lib/confetti";
import Button from "../ui/Button";
import PopularSearches from "./PopularSearches";

type Props = {
  destination: string;
  onDestinationChange: (value: string) => void;
  onSearch: (overrideDestination?: string) => void;
};

export default function SearchPanel({
  destination,
  onDestinationChange,
  onSearch,
}: Props) {

  // 建立專屬的點擊事件處理函式
  const handleSearchClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    // 計算按鈕在畫面上的座標，讓紙片從按鈕位置噴發
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (rect.left + rect.width / 2) / window.innerWidth;
    const y = (rect.top + rect.height / 2) / window.innerHeight;

    // 觸發特效
    void burstConfetti({
      particleCount: 140,
      spread: 90,
      startVelocity: 42,
      ticks: 220,
      origin: {
        x: Math.min(0.95, Math.max(0.05, x)),
        y: Math.min(0.9, Math.max(0.05, y)),
      },
    });

    // 執行原本外層 (page.tsx) 傳進來的搜尋邏輯
    onSearch();
  };

  return (
    <div className="relative bg-white/40 p-6 md:p-10 rounded-[2rem] md:rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.12)] max-w-2xl mx-auto border border-white/20">
      <h1 className="text-xl md:text-3xl font-extrabold text-slate-900 mb-6 md:mb-8 text-center tracking-tight">
        這次想去哪個城市旅遊呢？
      </h1>

      <div className="relative flex items-center">
        {/* --- 1. 手機版 Input --- 
            小於 sm (640px) 時顯示 (block)，大於 sm 時隱藏 (sm:hidden)
            使用較短的 placeholder，並縮小字體 (text-sm) 與上下內距 (py-4)
        */}
        <input
          type="text"
          value={destination}
          onChange={(e) => onDestinationChange(e.target.value)}
          placeholder="請輸入國家／城市"
          className="block sm:hidden w-full pl-5 pr-24 py-4 bg-white/80 border-none rounded-full focus:ring-2 focus:ring-blue-100 transition-all text-slate-700 placeholder:text-slate-400 text-sm"
        />
        <div className="block sm:hidden absolute right-2">
          <Button
            onClick={handleSearchClick}
            variant="primary"
            size="md"
          >
            搜尋
          </Button>
        </div>

        {/* --- 2. 桌機版 Input --- 
            預設隱藏 (hidden)，大於 sm (640px) 時才顯示 (sm:block)
            保留原本完整的 placeholder，並維持正常字體 (text-base) 與上下內距 (py-5)
        */}
        <input
          type="text"
          value={destination}
          onChange={(e) => onDestinationChange(e.target.value)}
          placeholder="請輸入國家／城市（東京、巴黎、上海、洛杉磯）"
          className="hidden sm:block w-full pl-6 pr-32 py-5 bg-white/80 border-none rounded-full focus:ring-2 focus:ring-blue-100 transition-all text-slate-700 placeholder:text-slate-400 text-base"
        />
        <div className="hidden sm:block absolute right-2">
          <Button
            onClick={handleSearchClick}
            variant="primary"
            size="lg"
          >
            搜尋
          </Button>
        </div>

       
      </div>

      <PopularSearches onSelect={(city) => {
        onDestinationChange(city);
        onSearch(city);
      }} />
    </div>
  );
}