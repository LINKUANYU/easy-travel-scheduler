import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchPlacePreview, type PlacePreview } from "@/app/lib/edit/placePreview";

export function usePlacePreview() {
  // 1. 我們只需要記住「現在正在看哪一個景點」即可
  const [activePlaceId, setActivePlaceId] = useState<string | null>(null);
  const [fallbackName, setFallbackName] = useState<string | undefined>(undefined);

  // 2. ⭐️ 核心魔法：交給 React Query 去處理抓取與快取
  const { 
    data: previewData, 
    isLoading: previewLoading, 
    error 
  } = useQuery({
    // queryKey 綁定 activePlaceId，只要 ID 一換，它就會自動去抓資料
    queryKey: ["placePreview", activePlaceId],
    queryFn: () => fetchPlacePreview(activePlaceId!),
    // enabled 確保：只有當 activePlaceId 有值時，才真的發送請求
    enabled: !!activePlaceId,
    // staleTime：1 小時內點擊同一個景點，直接從 sessionStorage 拿資料，一毛錢都不用花！
    staleTime: 1000 * 60 * 60,
  });

  // 3. 組合最終要給 UI 顯示的資料
  const preview = previewData
    ? { ...previewData, name: previewData.name ?? fallbackName }
    : null;

  // 4. 提供給地圖標記 (Marker) 點擊時呼叫的函式
  const updatePreview = (placeId: string, displayName?: string) => {
    if (!placeId) return;
    setFallbackName(displayName);
    setActivePlaceId(placeId); // 更新 ID，自動觸發上方 useQuery 運作
  };

  // 5. 提供給「X 關閉按鈕」或清除預覽時使用
  const clearPreview = () => {
    setActivePlaceId(null);
    setFallbackName(undefined);
  };

  // 6. 回傳給大總管 (保持你原本的回傳介面，不用改其他檔案！)
  return {
    preview,
    // 為了相容你原本寫在其他地方的 setPreview(null)，做一個簡單的包裝
    setPreview: (val: PlacePreview | null) => {
      if (val === null) clearPreview();
    },
    previewLoading,
    previewErr: error ? error.message : "",
    updatePreview,
  };
}