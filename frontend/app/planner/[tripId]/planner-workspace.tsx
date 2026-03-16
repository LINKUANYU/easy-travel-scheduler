"use client";

import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/app/lib/api";
import { useRouter } from "next/navigation";

import PlaceAutocompleteInput from "@/app/components/planner/PlaceAutocompleteInput";
import TripMap from "@/app/components/planner/TripMap";
import PlannerSaveButton from "@/app/components/planner/PlannerSaveBtn";
import PlacePoolPanel from "../../components/planner/PlacePoolPanel";
import DailyItineraryPanel from "../../components/planner/DailyItineraryPanel";
import { usePlaceThumbnails } from "../../hooks/usePlaceThumbnails";
import { usePlannerData } from "../../hooks/usePlannerData";
import { useTripDraft } from "@/app/hooks/useTripDraft";

// 輔助函式：確保從 URL 拿到的字串 tripId 能安全轉成數字
function normalizeTripId(x: string) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export default function PlannerWorkspace({ tripId }: { tripId: string }) {
  const router = useRouter();
  const tid = useMemo(() => normalizeTripId(tripId), [tripId]);

  // 1. 取得設定 ActiveTrip 的方法
  const { setActiveTripId } = useTripDraft();

  // 2. 當載入這個元件時，設定當前的 tripId 為活躍狀態
  useEffect(() => {
    if (tid !== null) {
      setActiveTripId(tid);
    }
  }, [tid, setActiveTripId]);

  // 3. 抓取 Trip 基本資料 (為了取得 days 天數)
  const tripQ = useQuery({
    queryKey: ["trip", tid],
    enabled: tid !== null,
    queryFn: async () => apiGet<any>(`/api/trips/${tid}`),
  });
  
  // 攔截無權限 (403) 或找不到行程 (404) 的狀態，利用 useEffect 安全地執行轉址與提示
  useEffect(() => {
    if (tripQ.error) {
      alert("您沒有權限查看此行程，或者該行程已不存在");
      router.push('/');
    }
  }, [tripQ.error, router]);

  // 4. 統籌所有行程與狀態資料 (等待 tid 和 trip 資料準備好才執行)
  const days = tripQ.data?.days ?? 1; 
  // 雖然 hook 必須在頂層呼叫，但因為 tid 和 days 在 loading 結束前可能不正確，
  // 我們先傳入預設值，等資料回來 React Query 會自動重新渲染。
  const data = usePlannerData(tid ?? 0, days);

  // 5. 統籌影像快取資料
  const { getThumbUrl } = usePlaceThumbnails(data.dayItems, data.sortedPlaces);

  // 6. 將「後端的原始資料」與「你目前拖拉的暫存順序 (data.dayItems)」進行融合，產生一個包含草稿狀態的 draftScheduleSummary，再傳給地圖。
  const draftScheduleSummary = useMemo(() => {
  const baseSummary = data.summaryQ.data ?? [];
  
  // 過濾掉「當前天數」的舊資料
  const filteredSummary = baseSummary.filter(s => s.day_index !== data.activeDay);
  
  // 將拖拉過後的暫存陣列 (data.dayItems) 轉成新的 summary 格式，並使用當下的 index 作為新 position
  const newActiveDaySummary = data.dayItems.map((item, index) => ({
    item_id: item.item_id,
    day_index: data.activeDay,
    position: index, // 👈 這裡賦予它拖拉後的新排序
    destination_id: item.destination_id,
  }));

  // 將「其他天的舊資料」跟「當天的暫存新資料」合併
  return [...filteredSummary, ...newActiveDaySummary];
}, [data.summaryQ.data, data.dayItems, data.activeDay]);
  
  // ==========================================
  // 阻擋畫面渲染 (Loading & Error 處理)
  // ==========================================
  if (tid === null) return <p className="p-4 text-red-500">tripId 不合法</p>;
  if (tripQ.isLoading) return <p className="p-4 text-gray-500">Loading trip…</p>;
  if (tripQ.isError) return <p className="p-4 text-red-500">Load trip failed: {(tripQ.error as Error).message}</p>;
  
  // 如果在錯誤狀態，直接回傳 null (畫面空白)，防止下方的 usePlannerData 繼續發送其他 API 導致 403 洗版
  if (tripQ.error) {
    return null; 
  }

  return (
    <div style={{ 
      display: "grid",
      gap: 12,
      padding: "16px", 
      height: "calc(100vh - 64px)", // 視窗高度減去 Header 高度 (64px)
      boxSizing: "border-box",
      overflow: "hidden" // 防止最外層出現捲軸
    }}>
      {data.uiMsg && <div style={{ fontSize: 13, opacity: 0.85 }}>{data.uiMsg}</div>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 2fr", // ✅ 25/25/50
          gap: 12,
          alignItems: "stretch",
          height: "100%", 
          minHeight: 0
        }}
      >
        {/* =========================
            左 25%：每日行程
           ========================= */}
        <DailyItineraryPanel
          activeDay={data.activeDay}
          days={days}
          onPrevDay={data.prevDay}
          onNextDay={data.nextDay}
          isLoading={data.dayItinQ.isLoading}
          error={data.dayItinQ.error as Error | null}
          dayItems={data.dayItems}
          legRouteMap={data.legRouteMap}
          currentDayLegModeMap={data.currentDayLegModeMap}
          onDragEnd={data.onDragEnd}
          getThumbUrl={getThumbUrl}
          onUpdatePreview={data.updatePreview}
          getItemTimeValue={data.getItemTimeValue}
          onApplyItemTime={data.applyItemTime}
          onClearItemTime={data.clearItemTime}
          onRemoveItem={(dayIndex, item_id) => data.removeItemM.mutate({ dayIndex, item_id })}
          isRemovingItem={data.removeItemM.isPending}
          onUpdateLegMode={data.updateCurrentDayLegMode}
        />

        {/* =========================
            中 25%：景點池（加入行程按鈕）
           ========================= */}
        <PlacePoolPanel
          isLoading={data.placesQ.isLoading}
          error={data.placesQ.error as Error | null}
          sortedPlaces={data.sortedPlaces}
          scheduledMap={data.scheduledMap}
          activeDay={data.activeDay}
          getThumbUrl={getThumbUrl}
          onUpdatePreview={data.updatePreview}
          onAddToDay={(destination_id) => data.addToDayM.mutate({ dayIndex: data.activeDay, destination_id })}
          isAdding={data.addToDayM.isPending}
          onRemovePlace={(destination_id) => data.removePlaceM.mutate(destination_id)}
          isRemoving={data.removePlaceM.isPending}
        />

        {/* =========================
            右 50%：地圖（你原本的）
           ========================= */}
        <div style={{ border: "1px solid #ddd", borderRadius: 12, overflow: "hidden", height: "100%" }}>
          <TripMap
            places={data.places}
            scheduleSummary={draftScheduleSummary}
            activeDay={data.activeDay}
            preview={data.preview}
            isAddingPreview={data.addPlaceM.isPending}
            onAddPreview={(placeId) => {
              const exists = data.places.some((p) => p.google_place_id === placeId);
              if (exists) return;
              data.addPlaceM.mutate(placeId);
            }}
            onClearPreview={() => data.setPreview(null)}
            onPlaceClick={(placeId) => data.updatePreview(placeId)}
            topLeft={
              <div style={{ display: "grid", gap: 8 }}>
                <PlaceAutocompleteInput
                  disabled={data.previewLoading}
                  placeholder="搜尋並選擇地點（Google Places）"
                  onPick={({placeId, label}) => data.updatePreview(placeId, label)}
                />

                {(data.previewLoading || data.previewErr) && (
                  <div style={{ fontSize: 13, opacity: 0.8 }}>
                    {data.previewLoading ? "載入預覽中…" : `預覽失敗：${data.previewErr}`}
                  </div>
                )}
              </div>
            }
            bottomRight={
              <div className="flex gap-[8px] items-center max-[1450px]:flex-col max-[1200px]:mt-[80px]">
                <PlannerSaveButton
                  dirty={!!data.dirtyDayMap[data.activeDay]}
                  saving={data.saveDayDraftM.isPending}
                  onClick={() => data.saveDayDraftM.mutate(data.activeDay)}
                />

                {/* 這裡加入你的下一步 / 分享按鈕 */}
                <button 
                  onClick={async () => {
                      try {
                        // 並且定義回傳的資料格式包含 { share_token: string }
                        const res = await apiPatch<{ share_token: string }>(`/api/trips/${tid}/share`);
                        
                        // 成功拿到 token 後，跳轉到唯讀頁面
                        router.push(`/share/${res.share_token}`);
                        
                      } catch (err) {
                        console.error(err);
                        alert("產生分享連結失敗，請稍後再試！");
                      }
                    }}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#7bb9d7",
                    color: "#fff",
                    borderRadius: "999px",
                    border: "none",
                    cursor: "pointer",
                    boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
                    fontWeight: 700,
                  }}
                >
                  下一步 (分享)
                </button>
              </div>
            }

          />
        </div>
      </div>
    </div>
  );
}