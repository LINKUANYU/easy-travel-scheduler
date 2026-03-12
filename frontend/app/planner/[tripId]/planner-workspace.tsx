"use client";

import PlaceAutocompleteInput from "@/app/planner/[tripId]/components/PlaceAutocompleteInput";
import TripMap from "@/app/planner/[tripId]/components/TripMap";
import PlannerSaveButton from "@/app/planner/[tripId]/components/PlannerSaveBtn";
import PlacePoolPanel from "./components/PlacePoolPanel";
import DailyItineraryPanel from "./components/DailyItineraryPanel";
import { usePlaceThumbnails } from "./hooks/usePlaceThumbnails";
import { useRouteCalculator } from "./hooks/useRouteCalculator";
import { usePlannerData } from "./hooks/usePlannerData";

export default function PlannerWorkspace({ tripId, days }: { tripId: number, days: number }) {  // ---------------------------------------------------------

// 1. 統籌所有行程與狀態資料
  const data = usePlannerData(tripId, days);

// 2. 統籌影像快取資料
const { getThumbUrl } = usePlaceThumbnails(data.dayItems, data.sortedPlaces);

// 3. 統籌交通計算資料
const { legRouteMap } = useRouteCalculator(data.dayItems, data.currentDayLegModeMap, data.placeByDestinationId);



  return (
    <div style={{ 
      display: "grid",
      gap: 12,
      height: "calc(100vh - 110px)", // 設定為視窗高度，需扣除上下空間
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
          height: "100%", // ✅ 撐滿父容器
          minHeight: 0    // ✅ 重要：防止內容撐開 Grid
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
          legRouteMap={legRouteMap}
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
            scheduleSummary={data.summaryQ.data ?? []}
            activeDay={data.activeDay}
            preview={data.preview}
            isAddingPreview={data.addPlaceM.isPending}
            onAddPreview={(placeId) => {
              const exists = data.places.some((p) => p.google_place_id === placeId);
              if (exists) return;
              data.addPlaceM.mutate(placeId);
            }}
            onClearPreview={() => data.setPreview(null)}
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
              <PlannerSaveButton
                dirty={!!data.dirtyDayMap[data.activeDay]}
                saving={data.saveDayDraftM.isPending}
                onClick={() => data.saveDayDraftM.mutate(data.activeDay)}
              />
            }

          />
        </div>
      </div>
    </div>
  );
}