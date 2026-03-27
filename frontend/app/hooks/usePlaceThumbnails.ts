// app/edit/[tripId]/hooks/usePlaceThumbnails.ts
import { useState, useEffect, useMemo } from "react";
import { fetchPlaceThumb, type PlaceThumb } from "@/app/lib/edit/placeThumb";
import type { TripPlace, ItineraryItem } from "@/app/types/all-types";
import { useQueries } from "@tanstack/react-query";

export function usePlaceThumbnails(
  dayItems: ItineraryItem[],
  sortedPlaces: TripPlace[]
) {
  // 1. 計算目前畫面上總共需要哪些 place_id 的圖片，拿「每日景點」、「景點池」的google ids
  const neededPlaceIds = useMemo(() => {
    const ids = new Set<string>();
    
    for (const it of dayItems) {
      if (it.google_place_id) ids.add(it.google_place_id);
    }
    for (const p of sortedPlaces) {
      if (p.google_place_id) ids.add(p.google_place_id);
    }

    return Array.from(ids);
  }, [dayItems, sortedPlaces]);

  // 2. 讓 React Query 幫你動態發送多個請求，並自動與 sessionStorage 結合
  const queryResults = useQueries({
    queries: neededPlaceIds.map((placeId) => ({
      // queryKey 就像是這張圖片在記憶吐司上的「專屬編號」
      queryKey: ["placeThumb", placeId],
      // queryFn 是真的要去呼叫 Google API 的動作
      queryFn: () => fetchPlaceThumb(placeId),
      // staleTime 雖然我們在 Provider 有設預設值，但這裡可以個別強調：1 週內絕對不要重抓
      staleTime: 1000 * 60 * 60 * 24 * 7,
      gcTime: 1000 * 60 * 60 * 24 * 7,
      // 避免因為沒有 placeId 而發出無效請求
      enabled: !!placeId,
    })),
  });


  // 3. 提供給外部取得單一圖片 URL 的輔助函式
  function getThumbUrl(placeId?: string | null) {
    if (!placeId) return undefined;
    
    // 找出這個 placeId 在陣列中的第幾個位置
    const index = neededPlaceIds.indexOf(placeId);
    
    // 如果畫面上根本不需要這個 ID，直接回傳 undefined
    if (index === -1) return undefined;

    // 透過相同的索引去 queryResults 拿對應的結果
    const match = queryResults[index];

    // 如果成功拿到資料，就回傳 url
    return match?.isSuccess ? match.data?.url : undefined;
  }

  // 5. 將狀態和操作函式回傳給呼叫端 (即大總管)
  return {
    getThumbUrl,
    // 在 UI 上顯示「圖片載入中」的骨架屏，可以用這行判斷：
    isLoading: queryResults.some((q) => q.isLoading),
  };
}