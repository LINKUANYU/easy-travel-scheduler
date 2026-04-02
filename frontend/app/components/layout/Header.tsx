"use client";

import Link from "next/link";
import AuthCorner from "./AuthCorner";

export default function Header() {

  return (
    <header className="sticky top-0 z-[100] w-full bg-white/70 backdrop-blur-md border-b border-gray-200/50 px-4 md:px-10 h-[72px] flex items-center justify-between">
      {/* 左側：預留空間（設定 flex-1 確保佔位對稱） */}
      <div className="flex-1"></div>
      {/* 中間：Slogan 絕對置中 */}
      {/* left-1/2: 從左邊推 50% */}
      {/* -translate-x-1/2: 將元素本身往回拉 50% 寬度，達成精準置中 */}
      <div className="absolute left-1/2 -translate-x-1/2 font-extrabold text-lg md:text-xl text-[#333] shrink-0 whitespace-nowrap">
        <Link href="/" style={{ textDecoration: "none", color: "#333" }}>
          Easy-Travel-Scheduler
        </Link>
      </div>

      {/* 右側：按鈕區 (設定 flex-1 確保佔位對稱，並靠右對齊) */}
      <div className="flex-1 flex justify-end">
        <AuthCorner />
      </div>
      
    </header>
  );
}