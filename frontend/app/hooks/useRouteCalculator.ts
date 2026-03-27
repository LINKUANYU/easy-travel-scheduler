// app/edit/[tripId]/hooks/useRouteCalculator.ts
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { hasLatLng, makeLegKey, computeLegRoute } from "@/app/lib/edit/itinerary-route-leg";
import type { ItineraryItem, TripPlace, TravelMode, LegRouteState } from "@/app/types/all-types";

export function useRouteCalculator(
  dayItems: ItineraryItem[],
  currentDayLegModeMap: Record<string, TravelMode>,
  placeByDestinationId: Map<number, TripPlace>
) {
  // 1. 建立點與點之間的路段物件陣列
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
        mode: currentDayLegModeMap[key] ?? ("" as TravelMode),
      });
    }

    return pairs;
  }, [dayItems, currentDayLegModeMap]);


  // 2. 讓 React Query 接管 API 請求與快取
  const queryResults = useQueries({
    queries: dayLegPairs.map(({ from, to, mode }) => {
      const fromPlace = placeByDestinationId.get(from.destination_id);
      const toPlace = placeByDestinationId.get(to.destination_id);
      
      // 你的防護網：必須有 mode 且座標完整，才准許發送請求
      const isReady = !!mode && hasLatLng(fromPlace) && hasLatLng(toPlace);

      // 檢查後端是否已經給過這段路程的計算結果？
      const hasServerData = from.travel_mode === mode && 
                            typeof from.duration_millis === "number" && 
                            typeof from.distance_meters === "number";

      return {
        // 🌟 將 mode 加入 key 裡面，使用者切換交通工具就會自動重抓並快取
        queryKey: ["routeLeg", from.item_id, to.item_id, mode],
        queryFn: () => computeLegRoute({
          from: { lat: fromPlace!.lat as number, lng: fromPlace!.lng as number },
          to: { lat: toPlace!.lat as number, lng: toPlace!.lng as number },
          mode: mode,
        }),
        enabled: isReady,
        staleTime: 1000 * 60 * 60 * 1, // 1 天內
        // 🌟 神來一筆：如果後端已經有資料，直接餵給快取，完全不用發出任何網路請求！
        initialData: hasServerData ? {
          durationMillis: from.duration_millis,
          distanceMeters: from.distance_meters,
        } : undefined,
      };
    }),
  });

  // 3. 把 queryResults 轉換回原本 UI 期望的 legRouteMap 格式
  const legRouteMap = useMemo(() => {
    const map: Record<string, LegRouteState> = {};
    
    dayLegPairs.forEach((pair, index) => {
      const result = queryResults[index];
      
      if (result) {
         map[pair.key] = {
           fromItemId: pair.from.item_id,
           toItemId: pair.to.item_id,
           mode: pair.mode,
           durationMillis: result.data?.durationMillis,
           distanceMeters: result.data?.distanceMeters,
           // 只有在真正發送網路請求時，才顯示 loading
           loading: result.isLoading && result.fetchStatus !== 'idle', 
           error: result.error ? result.error.message : undefined,
         };
      }
    });
    return map;
  }, [dayLegPairs, queryResults]);

  // 我們不再需要回傳 setLegRouteMap，因為狀態全自動管理了
  return { legRouteMap }; 
}