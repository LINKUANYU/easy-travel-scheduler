"use client";

import { useRouter } from "next/navigation";
import { useTripDraft } from "@/app/hooks/useTripDraft";

export default function NewTripButton() {
  const router = useRouter();
  // 引入你原本寫好的清除邏輯
  const { clear, clearActiveTrip } = useTripDraft();

  const handleCreateNew = () => {
    // 1. 清空 LocalStorage 中的景點草稿 (清空購物車)
    clear();
    // 2. 清空當前正在編輯的行程 ID，讓系統知道這是一趟全新的旅程
    if (clearActiveTrip) {
      clearActiveTrip();
    }

    // 3. 導向首頁
    router.push("/");
  };

  return (
    <button
      onClick={handleCreateNew}
      className="bg-blue-600 text-white px-5 py-2 rounded-lg font-medium hover:bg-blue-700 transition shadow-sm"
    >
      ＋ 新增行程
    </button>
  );
}