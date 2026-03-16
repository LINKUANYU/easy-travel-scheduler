// lib/useTripDraft.ts
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";

export type DraftPlace = {
  google_place_id: string;
  attraction: string;
  city: string;
  cover_url?: string;
};

// localStorage 的 key 名稱。
const KEY = "ets_trip_draft_v1";
const ACTIVE_TRIP_KEY = "ets_active_trip_id_v1"; // 用來記住現在是在編輯哪個 Trip

// 定義兩個廣播事件的名稱
const EVENT_DRAFT_UPDATE = "ets_draft_update";
const EVENT_ACTIVE_TRIP_UPDATE = "ets_active_trip_update";

// 安全版 JSON parse：如果 localStorage 沒資料：回 null
function safeParse<T>(s: string | null): T | null {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
}

// Hook 本體
export function useTripDraft() {
  // 1. 內部狀態
  // 景點草稿狀態 (購物車)，直接用 localStorage 當初始值（避免 mount 後才 setDraft 的競態）
  const [draft, setDraftState] = useState<DraftPlace[]>(() => {
    if (typeof window === "undefined") return [];
    const cached = safeParse<DraftPlace[]>(localStorage.getItem(KEY));
    return Array.isArray(cached) ? cached : [];
  });

  // 目前編輯的行程 ID (當前訂單)
  const [activeTripId, setActiveTripIdState] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const cached = localStorage.getItem(ACTIVE_TRIP_KEY);
    return cached ? Number(cached) : null;
  });

  // 2. setDraft：寫入狀態、寫入 Storage，並發送廣播
  const setDraft = useCallback((updater: DraftPlace[] | ((prev: DraftPlace[]) => DraftPlace[])) => {
    setDraftState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;  // 算出最新的購物車內容
      
      // 將 Side Effect (寫入與廣播) 放到 setTimeout 中
      // 這樣可以保證這些動作會在 React 完成當前渲染後才執行
      setTimeout(() => {
        localStorage.setItem(KEY, JSON.stringify(next));  
        window.dispatchEvent(new Event(EVENT_DRAFT_UPDATE));  // 發送當前draft更新廣播
      }, 0);
      return next;
    });
  }, []);

  // 3. setActiveTripId：同步廣播機制
  const setActiveTripId = useCallback((id: number | null) => {
    setActiveTripIdState(id);
    if (id === null) {
      localStorage.removeItem(ACTIVE_TRIP_KEY);
    } else {
      localStorage.setItem(ACTIVE_TRIP_KEY, String(id));
    }
    window.dispatchEvent(new Event(EVENT_ACTIVE_TRIP_UPDATE)); // 發送當前行程更新廣播
  }, []);


  // 4. 接收廣播：當其他元件改變資料時，自動拉取最新 LocalStorage 資料
  useEffect(() => {
    // 去拿最新資料並更新 State
    const syncDraft = () => {
      const cached = safeParse<DraftPlace[]>(localStorage.getItem(KEY));
      setDraftState(Array.isArray(cached) ? cached : []);
    };
    // 去拿最新資料並更新 State
    const syncActiveTrip = () => {
      const cached = localStorage.getItem(ACTIVE_TRIP_KEY);
      setActiveTripIdState(cached ? Number(cached) : null);
    };
    // 綁定監聽，有廣播時就執行
    window.addEventListener(EVENT_DRAFT_UPDATE, syncDraft);
    window.addEventListener(EVENT_ACTIVE_TRIP_UPDATE, syncActiveTrip);

    return () => {
      window.removeEventListener(EVENT_DRAFT_UPDATE, syncDraft);
      window.removeEventListener(EVENT_ACTIVE_TRIP_UPDATE, syncActiveTrip);
    };
  }, []);

  const ids = useMemo(() => new Set(draft.map(d => d.google_place_id)), [draft]);
  // 監控層[draft]： 檢查 draft 變了沒？ 變了才重跑。
  // 轉換層 map： 從 draft 抽出所有的 google_place_id 變成陣列。
  // 封裝層： 把陣列丟進 new Set() 變成不重複的集合。
  // 記憶層： 把最終的 Set 結果存起來，命名為 ids。
  // Set 搜尋快速、自動去重，Set(2) {"A", "B"} (Set Object)

  // 三個操作
  const add = useCallback((p: DraftPlace) => {  // p 準要要加入的景點
    setDraft(prev => prev.some(x => x.google_place_id === p.google_place_id) ? prev : [...prev, p]);
  }, [setDraft]);
  // 當 .some() 在執行時，它會像 for 迴圈一樣，一個一個把 prev (目前的草稿陣列) 裡的元素拿出來檢查，這每一個被拿出來檢查的元素就叫 x。
  // 只要發現任何一個現有的景點 x，其 google_place_id 跟新景點 p 的一樣，就會回傳 true，維持現狀。直接回傳原本的陣列
  // 如果是false ，新增成員。建立一個新陣列，包含舊有的所有元素 (...prev)，並在末尾加上新景點 p。

  const remove = useCallback((google_place_id: string) => {
    setDraft(prev => prev.filter(x => x.google_place_id !== google_place_id));
  }, [setDraft]);

  const clear = useCallback(() => setDraft([]), [setDraft]);
  
  // 提供清除 activeTrip 的方法 (當使用者想強制開新行程時)
  const clearActiveTrip = useCallback(() => setActiveTripId(null), [setActiveTripId]);

  return { draft, ids, add, remove, clear, activeTripId, setActiveTripId, clearActiveTrip };
}