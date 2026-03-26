"use client";

import { useUserTrips, useDeleteTrip } from "@/app/hooks/useTrips";
import { useRouter } from "next/navigation";
import { useTripDraft } from "@/app/hooks/useTripDraft";
import TripCard from "../components/dashboard/TripCard";
import Button from "../components/ui/Button";

export default function DashboardTripList() {
  const { data: trips, isLoading, isError } = useUserTrips();
  const deleteMutation = useDeleteTrip();

  const router = useRouter();
  const { clear, clearActiveTrip } = useTripDraft();

// 執行清空與跳轉的邏輯
  const handleStartNewTrip = () => {
    clear();
    if (clearActiveTrip) clearActiveTrip();
    router.push("/");
  };

  if (isLoading) return <p className="text-gray-500">載入行程中...</p>;
  if (isError) return <p className="text-red-500">無法載入行程，請確認您是否已登入。</p>;

  const handleDelete = (tripId: number) => {
    // 加上防呆確認，避免誤刪
    if (window.confirm("確定要刪除這個行程嗎？此動作無法復原。")) {
      deleteMutation.mutate(tripId);
    }
  };


// 判斷目前到底有沒有任何行程
  const hasTrips = trips && trips.length > 0;

  return (
    <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      
      {/* 永遠顯示的第一張卡片：虛線新增按鈕 */}
      {/* 把 onClick 綁定在整個 <li> 上，讓整張卡片都可以點擊 */}
      <li 
        onClick={handleStartNewTrip}
        className="border-2 border-dashed border-gray-300 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 transition min-h-[200px]"
      >
        <p className="text-gray-500 mb-4 font-medium">
          {hasTrips ? "準備好下一次的冒險了嗎？" : "目前還沒有儲存的行程喔！"}
        </p>
        {/* 按鈕加上 pointer-events-none 避免阻擋外層 <li> 的點擊事件 */}
        <Button>
          {hasTrips ? "+ 建立新行程" : "開始規劃第一趟旅程"}
        </Button>
      </li>

      {/* 渲染既有的行程卡片 */}
      {hasTrips && trips.map((t) => (
        <TripCard
          key={t.trip_id} 
          trip={t} 
          onDelete={() => handleDelete(t.trip_id)}
          isDeleting={deleteMutation.isPending}
        />
      ))}
    </ul>
  );
}