// app/planner/[tripId]/components/DailyItineraryPanel.tsx
"use client";

import React, { Fragment } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import TimePopover from "@/app/components/planner/TimePopover";
import { makeLegKey, formatDistance, formatDuration } from "@/app/lib/planner/itinerary-route-leg";
import type { ItineraryItem, LegRouteState, TravelMode } from "@/app/types/all-types";
import type { TimeField } from "@/app/lib/planner/itinerary-time";

// ==========================================
// 1. 定義拖拉工人 (SortableRow)
// ==========================================
// SortableRow：UI 的執行工人，像是一個「透明的防護罩」，把你的景點資料（例如台北 101）包起來。
function SortableRow({ id, children }: {
  id: number;
  children: (args: { dragAttributes: any; dragListeners: any; style: React.CSSProperties }) => React.ReactNode;
}) {
  // useSortable：賦予元件「排序靈魂」它幫你算好了所有拖拉需要的參數
  // setNodeRef: 告訴 dnd-kit：「嘿，這塊 DOM 元素（那個 <div>）就是我們要移動的東西。」
  // transform & transition: 這是最魔法的地方。當你拖動別的項目蓋過它時，它會算出位移量（transform），讓這行自動「閃開」騰出空間，並帶有平滑的動畫（transition）。
  // isDragging: 一個布林值，讓你知道「現在是不是正在抓著我」。
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  
  
  // 處理視覺畫面
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),  // 將座標物件轉成 CSS 字串，如 translate3d(0, 50px, 0)
    transition,  // 讓移動過程有流暢的動畫
    opacity: isDragging ? 0.6 : 1,  // 拖拽時讓本體變半透明，視覺效果更好
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({ dragAttributes: attributes, dragListeners: listeners, style })}
      {/* 這不是普通的 children（像 <div>內容</div>），而是一個函數。
      因為有時候我們不希望「整個整列」一點擊就拖走，我們可能只想讓左邊的「六個點圖示 (Drag Handle)」負責觸發拖拉。 */}
    </div>
  );
}

// ==========================================
// 2. 定義元件的 Props 管線
// ==========================================
interface DailyItineraryPanelProps {
  activeDay: number;
  days: number;
  onPrevDay: () => void;
  onNextDay: () => void;
  isLoading: boolean;
  error: Error | null;
  dayItems: ItineraryItem[];
  legRouteMap: Record<string, LegRouteState>;
  currentDayLegModeMap: Record<string, TravelMode>;
  onDragEnd: (event: DragEndEvent) => void;
  getThumbUrl: (placeId?: string | null) => string | undefined;
  onUpdatePreview: (placeId: string, displayName?: string) => void;
  getItemTimeValue: (item: ItineraryItem, field: TimeField) => string | null;
  onApplyItemTime: (item: ItineraryItem, field: TimeField, value: string | null) => void;
  onClearItemTime: (item: ItineraryItem, field: TimeField) => void;
  onRemoveItem: (dayIndex: number, item_id: number) => void;
  isRemovingItem: boolean;
  onUpdateLegMode: (legKey: string, mode: TravelMode) => void;
}

// ==========================================
// 3. 主元件
// ==========================================
export default function DailyItineraryPanel({
  activeDay,
  days,
  onPrevDay,
  onNextDay,
  isLoading,
  error,
  dayItems,
  legRouteMap,
  currentDayLegModeMap,
  onDragEnd,
  getThumbUrl,
  onUpdatePreview,
  getItemTimeValue,
  onApplyItemTime,
  onClearItemTime,
  onRemoveItem,
  isRemovingItem,
  onUpdateLegMode,
}: DailyItineraryPanelProps) {
  
  // PointerSensor (感應器類型) 這是最通用的感應器，它同時支援滑鼠 (Mouse) 和 觸控螢幕 (Touch)。
  // distance: 當位移 > 6 像素：系統才會確認：「開始動作」這時才會把元件抓起來變透明，進入拖拉狀態。
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: "0px 6px", display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "white" }}>
      {/* 頂部：天數切換 */}
      <div style={{ flexShrink: 0 }}>
        <div style={{ flexShrink: 0, height: "40px", display: "flex", justifyContent: "center", alignItems: "center" }}>
          <button onClick={onPrevDay} disabled={activeDay === 1} className="text-gray-400 hover:text-black disabled:opacity-30 mr-6">◀</button>
          <div style={{ fontWeight: 800, fontSize: "16px" }}>Day {activeDay}</div>
          <button onClick={onNextDay} disabled={activeDay === days} className="text-gray-400 hover:text-black disabled:opacity-30 ml-6">▶</button>
        </div>
      </div>

      {/* 滾動內容區 */}
      <div className="custom-scrollbar" style={{ overflowY: "auto", flexGrow: 1, paddingRight: 4 }}>
        {isLoading ? (
          <p>Loading itinerary…</p>
        ) : error ? (
          <p>Load itinerary failed: {error.message}</p>
        ) : dayItems.length === 0 ? (
          <p style={{ opacity: 0.7, textAlign: "center" }}>今天還沒加入行程</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={dayItems.map((it) => it.item_id)} strategy={verticalListSortingStrategy}>
              <div style={{ display: "grid", gap: 10 }}>
                {dayItems.map((it, idx) => {
                  const thumbUrl = getThumbUrl(it.google_place_id);
                  const next = dayItems[idx + 1];
                  const legKey = next ? makeLegKey(it.item_id, next.item_id) : null;
                  const leg = legKey ? legRouteMap[legKey] : undefined;

                  return (
                    <Fragment key={it.item_id}>
                      <SortableRow id={it.item_id}>
                        {({ dragAttributes, dragListeners }) => {
                          const arrivalValue = getItemTimeValue(it, "arrival_time");
                          const departureValue = getItemTimeValue(it, "departure_time");

                          return (
                            <div
                              style={{
                                border: "1px solid #eee",
                                borderRadius: 12,
                                padding: 10,
                                display: "grid",
                                gridTemplateColumns: "72px minmax(0, 1fr) 28px",
                                gap: 12,
                                alignItems: "center",
                                background: "white",
                                position: "relative"
                              }}
                            >
                              {/* --- 圖片區塊 --- */}
                              <div
                                style={{
                                  width: "80px",
                                  height: "80px",
                                  borderRadius: "10px", // 原本圓角
                                  backgroundColor: "#e5e7eb",
                                  flexShrink: 0,
                                  overflow: "hidden",
                                  position: "relative", 
                                }}
                              >
                                {/* 加入 position 數值標籤 */}
                                <div
                                  style={{
                                    position: "absolute",
                                    top: "0",
                                    left: "0",
                                    backgroundColor: "rgba(0, 0, 0, 0.6)", // 半透明黑底
                                    color: "#fff", // 白色文字
                                    padding: "3px 8px", // 內邊距，配合较大圖片
                                    fontSize: "14px", // 字體大小，配合较大圖片
                                    fontWeight: "bold",
                                    borderRadius: "10px", 
                                    zIndex: 1, // 確保標籤在圖片上方
                                  }}
                                >
                                  {idx + 1}
                                </div>

                                {thumbUrl ? (
                                  <img
                                    src={thumbUrl}
                                    alt={it.place_name}
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      objectFit: "cover",
                                    }}
                                  />
                                ) : (
                                  <div
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      height: "100%",
                                      fontSize: "14px",
                                      color: "#9ca3af",
                                    }}
                                  >
                                    載入中
                                  </div>
                                )}
                              </div>

                              {/* 中：名稱 + 時間 */}
                              <div style={{ minWidth: 0, cursor: "pointer" }} onClick={() => onUpdatePreview(it.google_place_id, it.place_name)}>
                                <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {it.place_name ?? `#${it.destination_id}`}
                                </div>
                                <div style={{ marginTop: 8, fontSize: 14, color: "#555", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  <span>抵達時間：</span>
                                  <TimePopover
                                    label=""
                                    value={arrivalValue}
                                    onApply={(value) => onApplyItemTime(it, "arrival_time", value)}
                                    onClear={() => onClearItemTime(it, "arrival_time")}
                                    compact
                                  />
                                </div>
                                <div style={{ marginTop: 8, fontSize: 14, color: "#555", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  <span>離開時間：</span>
                                  <TimePopover
                                    label=""
                                    value={departureValue}
                                    onApply={(value) => onApplyItemTime(it, "departure_time", value)}
                                    onClear={() => onClearItemTime(it, "departure_time")}
                                    compact
                                  />
                                </div>
                              </div>

                              {/* 右：X + ⠿ */}
                              <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center" }}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRemoveItem(activeDay, it.item_id);
                                  }}
                                  disabled={isRemovingItem}
                                  className="h-8 w-8 flex items-center justify-center rounded-full text-gray-300 bg-transparent text-2xl leading-none transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  ×
                                </button>
                                <span
                                  {...dragAttributes}
                                  {...dragListeners}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ cursor: "grab", color: "#000", fontSize: 24, lineHeight: 1, userSelect: "none", padding: 5, border: "1px solid #ddd", borderRadius: 10 }}
                                  title="拖拉排序"
                                >
                                  ⠿
                                </span>
                              </div>
                            </div>
                          );
                        }}
                      </SortableRow>

                      {/* 路段交通資訊 (Leg) */}
                      {next && legKey && (
                        <div style={{ display: "grid", gridTemplateColumns: "24px 1fr", gap: 10, alignItems: "stretch", padding: "2px 0 6px 0" }}>
                          <div style={{ display: "flex", justifyContent: "center" }}>
                            <div style={{ width: 6, borderRadius: 999, background: "#cdeff0", minHeight: 56 }} />
                          </div>
                          <div style={{ borderRadius: 12, padding: "8px 10px", background: "#fafafa", border: "1px dashed #e5e5e5", display: "grid", gap: 6 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                              <span style={{ fontSize: 13, opacity: 0.75 }}>交通</span>
                              <select
                                value={currentDayLegModeMap[legKey] ?? "DRIVING"}
                                onChange={(e) => onUpdateLegMode(legKey, e.target.value as TravelMode)}
                                style={{ padding: "6px 8px", borderRadius: 10, border: "1px solid #ddd", background: "white" }}
                              >
                                <option value="DRIVING">開車</option>
                                <option value="WALKING">步行</option>
                                <option value="TRANSIT">大眾運輸</option>
                              </select>
                              <span style={{ fontSize: 13, opacity: 0.85 }}>
                                {leg?.loading ? "計算中…" : leg?.error ? `失敗：${leg.error}` : `${formatDuration(leg?.durationMillis)} · ${formatDistance(leg?.distanceMeters)}`}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}