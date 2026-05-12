// 職責：封裝三個行程相關的 useQuery，對外回傳完整 Query 物件
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/app/lib/api";
import type { TripPlace } from "@/app/types/trip";
import type { ItineraryItem, ItinerarySummaryRow } from "@/app/types/itinerary";

// 將後端回傳的各種格式統一轉成陣列
function normalizeArrayPayload<T>(payload: any): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && Array.isArray(payload.data)) return payload.data as T[];
  return [];
}

export function useItineraryQueries(tripId: number, activeDay: number) {
  // 景點池：此行程所有已儲存的地點
  const placesQ = useQuery({
    queryKey: ["tripPlaces", tripId],
    queryFn: async () =>
      normalizeArrayPayload<TripPlace>(await apiGet(`/api/trips/${tripId}/places`)),
  });

  // 行程摘要：快速對照哪些景點已出現在哪一天
  const summaryQ = useQuery({
    queryKey: ["itinerarySummary", tripId],
    queryFn: async () =>
      normalizeArrayPayload<ItinerarySummaryRow>(
        await apiGet(`/api/trips/${tripId}/itinerary/summary`)
      ),
  });

  // 當日明細：特定某一天的具體景點排序資料
  const dayItinQ = useQuery({
    queryKey: ["dayItinerary", tripId, activeDay],
    queryFn: async () =>
      normalizeArrayPayload<ItineraryItem>(
        await apiGet(`/api/trips/${tripId}/days/${activeDay}/itinerary`)
      ),
  });

  return { placesQ, summaryQ, dayItinQ };
}
