"use client";

import { usePathname } from "next/navigation";

export default function Footer() {
  const pathname = usePathname();

  // ★ 判斷：如果是編輯頁或分享頁，直接回傳 null (不渲染 Footer)
  // 確保這些頁面能呈現完美的 100vh 滿版體驗
  if (pathname.startsWith('/edit') || pathname.startsWith('/share')) {
    return null;
  }

  return (
    <footer className="bg-[#fafafa] border-t border-[#eaeaea] py-6 text-center text-[#666] text-sm mt-auto z-10">
      <p className="m-0 font-medium">
        讓旅遊規劃變輕鬆 © {new Date().getFullYear()} Easy-Travel-Scheduler
      </p>
    </footer>
  );
}