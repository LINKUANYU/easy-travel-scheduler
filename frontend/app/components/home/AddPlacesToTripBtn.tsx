"use client"

import { useMemo, useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { apiPost } from "@/app/lib/api"
import { useTripDraft } from "@/app/hooks/useTripDraft"


type CreateTripRes = { trip_id: number, edit_token: string} 

export default function AddPlacesToTripBtn(){
  const router = useRouter();

  const { draft, clear, activeTripId, clearActiveTrip } = useTripDraft();
  
  // 新增一個狀態來判斷元件是否已經在瀏覽器端載入完成
  const [isMounted, setIsMounted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 等到 page 跑完才執行，然後state狀態改變，整個元件重跑，按鈕才顯示出來
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const draftCount = draft.length;

  // 去重(以防萬一) 如果沒景點，這裡就是空陣列 []
  const placeIds = useMemo(() => {
    const set = new Set<string>(); // 建立資料結構set
    for (const p of draft){
      if (p.google_place_id) set.add(p.google_place_id);
    }
    return Array.from(set);  // 把set轉成陣列
  }, [draft]);

  // ==========================================
  // 動作 2：已有trip，追加景點
  // ==========================================
  const handleAppendToActiveTrip = async () => {

    // 如果購物車沒東西，直接跳回去就好
    if (placeIds.length === 0) {
      router.push(`/edit/${activeTripId}`);
      return;
    }

    setSubmitting(true);
    try {
      // 利用 Promise.all 同時發送多個追加景點的 API 請求
      // 對應你 trips.py 裡面的 add_trip_place (POST /api/trips/{trip_id}/places)
      await Promise.all(
        placeIds.map(gpid => 
          apiPost(`/api/trips/${activeTripId}/places`, { google_place_id: gpid })
        )
      );

      // 追加成功後，清空購物車，然後跳轉回編輯頁面
      clear();
      router.push(`/edit/${activeTripId}`);
    } catch (e: any) {
      alert(e?.message ?? "追加景點失敗，請稍後再試");
    } finally {
      setSubmitting(false);
    }
  };

  // ==========================================
  // UI 渲染邏輯
  // ==========================================

  // 關鍵防護網：如果還沒確認在瀏覽器端，先回傳一個空的佔位符 (或是 null)，
  // 這樣就能保證伺服器跟瀏覽器的第一次渲染都是「空的」，完美避開 Hydration 錯誤！
  if (!isMounted) return null;
  if (!activeTripId) return null;
  
  return (
    <div className="fixed bottom-10 right-8 z-50 flex items-center gap-4">
      {/* 放棄目前行程，開新行程的小按鈕 */}
      <button
        onClick={() => {
          if(confirm("確定要放棄目前編輯的行程，建立一個全新的嗎？")) {
            clearActiveTrip();
            clear();
            router.push(`/`);
          }
        }}
        className="rounded-full bg-white px-5 py-3 text-gray-500 shadow-lg border border-gray-200 hover:bg-gray-50 transition text-sm font-bold"
      >
        ✕ 捨棄目前行程
      </button>

      {/* 核心動作按鈕群組 (設定 relative 讓小 X 可以絕對定位) */}
      <div className="relative">
        
        {/* 清空購物車景點 (小 X) - 只有當有景點時才顯示 */}
        {draftCount > 0 && (
          <button
            onClick={() => {
              if(confirm("確定要清空已選取的景點嗎？")) {
                clear();
              }
            }}
            className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white shadow-md hover:bg-red-600 transition text-sm font-bold z-10"
            title="清空已選景點"
          >
            ✕
          </button>
        )}

        {/* 核心動作按鈕 */}
        <button
          onClick={handleAppendToActiveTrip}
          disabled={submitting}
          className="flex items-center gap-2 rounded-full bg-indigo-600 px-6 py-4 text-white shadow-lg hover:bg-indigo-700 transition font-bold disabled:opacity-60"
        >
          {submitting ? (
            "處理中..."
          ) : draftCount > 0 ? (
            <>
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-indigo-600 text-sm">
                {draftCount}
              </div>
              <span>追加景點至目前行程 ➔</span>
            </>
          ) : (
            "返回目前行程 ➔"
          )}
        </button>
      </div>
    </div>
  );
}