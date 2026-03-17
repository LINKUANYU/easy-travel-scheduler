"use client";

import Link from "next/link";
import { useUserTrips, useDeleteTrip } from "@/app/hooks/useTrips";
import { useRouter } from "next/navigation";
import { useTripDraft } from "@/app/hooks/useTripDraft";

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
        <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition pointer-events-none">
          {hasTrips ? "+ 建立新行程" : "開始規劃第一趟旅程"}
        </button>
      </li>

      {/* 渲染既有的行程卡片 */}
      {hasTrips && trips.map((t) => (
        <li key={t.trip_id} className="border border-gray-200 rounded-xl p-5 shadow-sm hover:shadow-md transition bg-white flex flex-col min-h-[200px]">
          <div className="font-bold text-xl mb-2 truncate">{t.title}</div>
          <div className="text-sm text-gray-500 mb-6 flex items-center">
            <span className="bg-gray-100 px-2 py-1 rounded mr-2">{t.days} 天</span>
            {t.start_date && <span>出發日: {t.start_date}</span>}
          </div>
          
          {/* 按鈕操作區塊 (置底) */}
          <div className="mt-auto flex gap-2 pt-4 border-t border-gray-100">
            {/* 編輯 */}
            <Link 
              href={`/planner/${t.trip_id}`} 
              className="flex-1 text-center bg-blue-50 text-blue-600 py-2 rounded-lg text-sm font-medium hover:bg-blue-100 transition"
            >
              編輯
            </Link>
            
            {/* 查看 (加入你前幾步做的防呆) */}
            {t.share_token ? (
              <Link 
                href={`/share/${t.share_token}`} 
                className="flex-1 text-center bg-gray-50 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 transition"
              >
                查看
              </Link>
            ) : (
              <button 
                onClick={() => alert("還沒有儲存的行程")}
                className="flex-1 text-center bg-gray-50 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-100 transition"
              >
                查看
              </button>
            )}
            
            {/* 刪除 */}
            <button 
              onClick={() => handleDelete(t.trip_id)}
              disabled={deleteMutation.isPending}
              className="flex-1 text-center bg-red-50 text-red-600 py-2 rounded-lg text-sm font-medium hover:bg-red-100 transition disabled:opacity-50"
            >
              {deleteMutation.isPending ? "刪除中..." : "刪除"}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}