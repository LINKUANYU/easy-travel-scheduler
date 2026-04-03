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
        queryFn: async () => {
          try {
            return await computeLegRoute({
              from: { lat: fromPlace!.lat as number, lng: fromPlace!.lng as number },
              to: { lat: toPlace!.lat as number, lng: toPlace!.lng as number },
              mode: mode,
            });
          } catch (error: any) {  // 攔截預期錯誤，沒有路線的狀態
            // 將錯誤包裝成正常物件回傳，這樣 React Query 才會幫我們把「錯誤結果」快取起來
            return { isExpectedError: true, message: error.message || "查無路線" };
          }
        },
        enabled: isReady,
        staleTime: 1000 * 60 * 60 * 1, // 1 小時
        retry: false, // 因為預期有時就是沒路線，不需要浪費額度重試 3 次
        // 🌟 如果後端已經有資料，直接餵給快取，完全不用發出任何網路請求！
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
        // 🌟 判斷回傳的資料是不是我們攔截下來的「預期內錯誤」
         const data = result.data as any;
         const isRouteError = data?.isExpectedError;

         map[pair.key] = {
           fromItemId: pair.from.item_id,
           toItemId: pair.to.item_id,
           mode: pair.mode,
           // 如果是預期內錯誤，就不會有時間跟距離
           durationMillis: isRouteError ? undefined : data?.durationMillis,
           distanceMeters: isRouteError ? undefined : data?.distanceMeters,
           loading: result.isLoading && result.fetchStatus !== 'idle', 
           // 錯誤訊息來源：可能是接到的 isRouteError，也可能是程式真的壞掉的 result.error
           error: isRouteError ? data.message : (result.error ? result.error.message : undefined),
         };
      }
    });
    return map;
  }, [dayLegPairs, queryResults]);

  // 我們不再需要回傳 setLegRouteMap，因為狀態全自動管理了
  return { legRouteMap }; 
}