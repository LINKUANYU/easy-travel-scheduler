"use client";
import { burstConfetti } from "@/app/lib/confetti";

type Props = {
  destination: string;
  onDestinationChange: (value: string) => void;
  onSearch: () => void;
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
    <div className="relative bg-white/40 p-10 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.12)] max-w-2xl mx-auto border border-white/20">
      <h1 className="text-3xl font-extrabold text-slate-900 mb-8 text-center tracking-tight">
        這次想去哪個城市旅遊呢？
      </h1>

      <div className="relative flex items-center">
        <input
          type="text"
          value={destination}
          onChange={(e) => onDestinationChange(e.target.value)}
          placeholder="請輸入國家／城市（東京、巴黎、上海、洛杉磯）"
          className="w-full pl-6 pr-32 py-5 bg-white/80 border-none rounded-full focus:ring-2 focus:ring-blue-100 transition-all text-slate-700 placeholder:text-slate-400"
        />

        <button
          onClick={handleSearchClick}
          className="absolute right-2 bg-slate-900/80 text-white px-8 py-3.5 rounded-full hover:bg-slate-800 transition-all font-bold text-sm"
        >
          出發搜尋
        </button>

      </div>
    </div>
  );
}