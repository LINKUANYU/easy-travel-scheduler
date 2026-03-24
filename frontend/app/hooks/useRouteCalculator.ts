// app/edit/[tripId]/hooks/useRouteCalculator.ts
import { useState, useEffect, useMemo, useRef } from "react";
import { hasLatLng, makeLegKey, computeLegRoute } from "@/app/lib/edit/itinerary-route-leg";
import type { ItineraryItem, TripPlace, TravelMode, LegRouteState } from "@/app/types/all-types";

export function useRouteCalculator(
  dayItems: ItineraryItem[],
  currentDayLegModeMap: Record<string, TravelMode>,
  placeByDestinationId: Map<number, TripPlace>
) {
  // 1. 狀態：記錄每一段實際算出來的結果。例如：{"101-205": {mode: "DRIVING", fromItemId: 101, toItemId: 205, durationMillis: 8820000, distanceMeters: 123000}}
  const [legRouteMap, setLegRouteMap] = useState<Record<string, LegRouteState>>({});
  
  // 2. Ref：用來記錄每一段路徑目前的請求序號，避免 Race Condition
  const legReqTokenRef = useRef<Record<string, number>>({});

  // 3. 衍生資料：建立點與點之間的路段物件陣列
  const dayLegPairs = useMemo(() => {
    const pairs: Array<{
      key: string;
      from: ItineraryItem;
      to: ItineraryItem;
      mode: TravelMode;
    }> = [];

    for (let i = 0; i < dayItems.length - 1; i++) {
      const from = dayItems[i];
      const to = dayItems[i + 1];
      const key = makeLegKey(from.item_id, to.item_id);

      pairs.push({
        key,
        from,
        to,
        mode: currentDayLegModeMap[key] ?? "DRIVING",
      });
    }

    return pairs;
  }, [dayItems, currentDayLegModeMap]);

  // 4. 副作用：監聽路段變化並呼叫 API 計算路線
  useEffect(() => {
    // 篩選需要更新的路段，存成物件陣列
    const pending = dayLegPairs.filter(({ key, from, to, mode }) => {
      const fromPlace = placeByDestinationId.get(from.destination_id);
      const toPlace = placeByDestinationId.get(to.destination_id);
      // 檢查座標，不完整資料就不要
      if (!hasLatLng(fromPlace) || !hasLatLng(toPlace)) return false; 
      // 舊資料中把[key]帶進去
      const cached = legRouteMap[key];
      if (!cached) return true;  // 如果不存在，就代表是新的資料，需要去計算路線
      if (cached.mode !== mode) return true;  // 如果交通模式不一樣就是true，交通方式改變需要計算路線
      if (cached.loading) return false;  // 如果已經在算了，就不要重新再計算
      // 同一 mode 已經有結果或有錯誤 -> 不要再算
      if (
        typeof cached.durationMillis === "number" ||
        typeof cached.distanceMeters === "number" ||
        cached.error
      ) {
        return false;
      }
      // 其他不完整狀態，保守起見再算一次
      return true;
    });

    if (pending.length === 0) return;

    async function loadLegs() {
      for (const req of pending) {
        // 拿 req.from.destination_id 的景點id去「景點池」資料<TripPlace>裡找 lat、 lng
        const fromPlace = placeByDestinationId.get(req.from.destination_id);
        const toPlace = placeByDestinationId.get(req.to.destination_id);

        // 座標有缺就跳過
        if (!hasLatLng(fromPlace) || !hasLatLng(toPlace)) continue;

        // 這一段 leg 的最新請求編號 +1
        const nextToken = (legReqTokenRef.current[req.key] ?? 0) + 1;
        legReqTokenRef.current[req.key] = nextToken; 

        // 先把舊資料掛上讀取中，體驗會順暢很多。如果不先設 loading: true，使用者點擊切換交通工具後，畫面會卡在舊的數據幾秒鐘才跳掉，感覺像當機。
        setLegRouteMap((prev) => ({
          ...prev,
          [req.key]: {
            ...prev[req.key],
            fromItemId: req.from.item_id,
            toItemId: req.to.item_id,
            mode: req.mode,
            loading: true,  // 告訴 UI：這段路正在算，請轉圈圈
            error: undefined,  // 把之前的錯誤洗掉
          },
        }));
        
        // Call 寫好的計算路徑API
        try {
          const result = await computeLegRoute({
            from: { lat: fromPlace.lat as number, lng: fromPlace.lng as number },
            to: { lat: toPlace.lat as number, lng: toPlace.lng as number },
            mode: req.mode,
          });

          // 如果這不是最新那筆 request 的回應，就丟掉
          if (legReqTokenRef.current[req.key] !== nextToken) continue;

          setLegRouteMap((prev) => ({
            ...prev,
            [req.key]: {
              fromItemId: req.from.item_id,
              toItemId: req.to.item_id,
              mode: req.mode,
              durationMillis: result.durationMillis,
              distanceMeters: result.distanceMeters,
              loading: false,
              error: undefined,
            },
          }));
        } catch (e: any) {
          // 如果這不是最新那筆 request 的回應，就丟掉
          if (legReqTokenRef.current[req.key] !== nextToken) continue;

          setLegRouteMap((prev) => ({
            ...prev,
            [req.key]: {
              fromItemId: req.from.item_id,
              toItemId: req.to.item_id,
              mode: req.mode,
              loading: false,
              error: e?.message || "route failed",
            },
          }));
        }
      }
    }

    // 加入 Debounce 防抖：設定計時器，延遲 1 秒才執行
    const timeoutId = setTimeout(() => {
      loadLegs();
    }, 1000);

    // 清除機制 (Cleanup)：
    // 如果在這 1 秒內，dayLegPairs 又改變了（代表使用者還在猶豫、繼續拖拉），
    // React 會先執行這裡把「舊的計時器」取消掉，確保 API 不會被亂打！
    return () => {
      clearTimeout(timeoutId);
    };

  }, [dayLegPairs, placeByDestinationId]);

  return { legRouteMap };
}