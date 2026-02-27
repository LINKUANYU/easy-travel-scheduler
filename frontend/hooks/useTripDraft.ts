// lib/useTripDraft.ts
"use client";

import { useEffect, useMemo, useState, useRef } from "react";

export type DraftPlace = {
  google_place_id: string;
  attraction: string;
  city: string;
  cover_url?: string;
};

// localStorage 的 key 名稱。
const KEY = "ets_trip_draft_v1";

// 安全版 JSON parse：如果 localStorage 沒資料：回 null
function safeParse<T>(s: string | null): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

// Hook 本體
export function useTripDraft() {
  // ✅ 直接用 localStorage 當初始值（避免 mount 後才 setDraft 的競態）
  const [draft, setDraft] = useState<DraftPlace[]>(() => {
    if (typeof window === "undefined") return [];
    const cached = safeParse<DraftPlace[]>(localStorage.getItem(KEY));
    return Array.isArray(cached) ? cached : [];
  });

  // ✅ draft 變了才寫回
  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(draft));
  }, [draft]);

  const ids = useMemo(() => new Set(draft.map(d => d.google_place_id)), [draft]);
  // 監控層[draft]： 檢查 draft 變了沒？ 變了才重跑。
  // 轉換層 map： 從 draft 抽出所有的 google_place_id 變成陣列。
  // 封裝層： 把陣列丟進 new Set() 變成不重複的集合。
  // 記憶層： 把最終的 Set 結果存起來，命名為 ids。
  // Set 搜尋快速、自動去重，Set(2) {"A", "B"} (Set Object)

  // 三個操作
  const add = (p: DraftPlace) => {  // p：準備要加入的新地點
    setDraft(prev => prev.some(x => x.google_place_id === p.google_place_id) ? prev : [...prev, p]);
  };
  // 當 .some() 在執行時，它會像 for 迴圈一樣，一個一個把 prev (目前的草稿陣列) 裡的元素拿出來檢查，這每一個被拿出來檢查的元素就叫 x。
  // 只要發現任何一個現有的景點 x，其 google_place_id 跟新景點 p 的一樣，就會回傳 true，維持現狀。直接回傳原本的陣列
  // 如果是false ，新增成員。建立一個新陣列，包含舊有的所有元素 (...prev)，並在末尾加上新景點 p。

  const remove = (google_place_id: string) => {
    setDraft(prev => prev.filter(x => x.google_place_id !== google_place_id));
  };

  const clear = () => setDraft([]);

  return { draft, ids, add, remove, clear };
}