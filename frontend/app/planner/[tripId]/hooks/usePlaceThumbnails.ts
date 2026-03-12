// app/planner/[tripId]/hooks/usePlaceThumbnails.ts
import { useState, useEffect, useMemo } from "react";
import { fetchPlaceThumb, type PlaceThumb } from "@/app/lib/planner/placeThumb";
import type { TripPlace, ItineraryItem } from "@/app/types/all-types";

export function usePlaceThumbnails(
  dayItems: ItineraryItem[],
  sortedPlaces: TripPlace[]
) {
  // 1. 儲存圖片 URL 的 State，Record 定義成一個物件 {string: PlaceThumb} 組成
  const [thumbMap, setThumbMap] = useState<Record<string, PlaceThumb>>({});

  // 2. 計算目前畫面上總共需要哪些 place_id 的圖片，拿「每日景點」、「景點池」的google ids
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

  // 3. 背景非同步抓取圖片邏輯
  useEffect(() => {
    let cancelled = false;  

    // 從「目前畫面需要的所有 placeId」裡，只挑出「還沒存在 thumbMap 裡」的那些 id。
    const missingIds = neededPlaceIds.filter((id) => !thumbMap[id]);
    // 這裡的 id 不是固定文字，而是 filter() 每次跑時拿到的一個 place id，例如 "ChIJL..."。所以你不能寫：thumbMap.id


    if (missingIds.length === 0) return;

    async function loadThumb(){
      const results = await Promise.allSettled(
        missingIds.map((placeId) => fetchPlaceThumb(placeId)) // 去呼叫 lib 裡的工具
      );
      
      if (cancelled) return;  // 因為非同步，資料抓完先檢查元件有沒有被卸載，沒有才繼續渲染

      setThumbMap((prev) => {  // 先傳入舊的state
        const next = { ...prev };

        // result 與 missingIds 的順序會對齊
        results.forEach((result, index) => {
          const placeId = missingIds[index];  // 把missingIds 陣列裡的id抓出來
          if (next[placeId]) return;  // 如果已經存在在舊的state就retrun

          next[placeId] =             // 如果不存在就新增一個{placeId: result.value 圖片結果}
            result.status === "fulfilled"  // 如果fetch 是成功的話
              ? result.value
              : ({} as PlaceThumb);  // fetch 失敗就放空的
        });
        
        return next;
      });
    }

    loadThumb();

    return () => {
      cancelled = true;  // cleanup 代表這一輪 effect 結束了，之後它的 async 結果就不要再碰 state 了。
    };
  }, [neededPlaceIds]); // 只在需要的 ID 改變時觸發

  // 4. 提供給外部取得單一圖片 URL 的輔助函式
  function getThumbUrl(placeId?: string | null) {
    if (!placeId) return undefined;
    const thumb = thumbMap[placeId];
    return thumb?.url;
  }

  // 5. 將狀態和操作函式回傳給呼叫端 (即大總管)
  return {
    thumbMap,
    getThumbUrl
  };
}