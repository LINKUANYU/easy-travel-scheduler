import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiDelete } from "../lib/api";
import type { TripData } from "@/app/types/trip";

// 1. 撈取會員所有行程
export function useUserTrips() {
  return useQuery({
    queryKey: ["userTrips"], // 這是這包資料的專屬快取標籤
    queryFn: () => apiGet<TripData[]>("/api/trips"),
  });
}

// 2. 刪除特定行程
export function useDeleteTrip() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (tripId: number) => apiDelete(`/api/trips/${tripId}`),
    onSuccess: () => {
      // 刪除成功後，通知 QueryClient 讓 "userTrips" 快取失效並重新撈取
      queryClient.invalidateQueries({ queryKey: ["userTrips"] });
    },
  });
}