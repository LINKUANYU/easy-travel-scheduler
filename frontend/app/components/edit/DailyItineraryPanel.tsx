// app/edit/[tripId]/components/DailyItineraryPanel.tsx
"use client";

import React, { Fragment } from "react";
import { DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import TimePopover from "@/app/components/edit/TimePopover";
import { makeLegKey, formatDistance, formatDuration } from "@/app/lib/edit/itinerary-route-leg";
import type { ItineraryItem, LegRouteState, TravelMode } from "@/app/types/all-types";
import type { TimeField } from "@/app/lib/edit/itinerary-time";

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
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8, // 桌機：滑鼠移動 8px 才觸發拖拉
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 50, // 手機關鍵：按住 50 毫秒才會觸發拖拉，
        tolerance: 5, // 容忍度：按住的期間，手指稍微偏移 5px 內都不會中斷觸發
      },
    })
  );

  const DAY_COLORS = ["#71b5c8", "#82cda4", "#f8cb42", "#e76f51", "#b97ced"];
  const themeColor = DAY_COLORS[(activeDay - 1) % DAY_COLORS.length];

  return (
    <div 
      className="transition-colors duration-300 ease-in-out rounded-xl p-0 flex flex-col h-full min-h-0 bg-white"
      style={{ border: `2px solid ${themeColor}` }}
    >
      {/* 頂部：天數切換 */}
      <div className="shrink-0 pb-[10px]">
        <div 
          className="h-[44px] flex justify-center items-center text-white rounded-t-[10px] px-4 transition-colors duration-300 ease-in-out"
          style={{ backgroundColor: themeColor }}
        >
          <button 
            onClick={onPrevDay} 
            disabled={activeDay === 1} 
            className="border-none bg-transparent text-white text-lg mr-2.5 cursor-pointer disabled:cursor-default disabled:opacity-30 transition-opacity"
          >
            ◀
          </button>
          
          <div className="font-extrabold text-base flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: "20px", height: "20px" }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            Day {activeDay}
          </div>

          <button 
            onClick={onNextDay} 
            disabled={activeDay === days} 
            className="border-none bg-transparent text-white text-lg ml-2.5 cursor-pointer disabled:cursor-default disabled:opacity-30 transition-opacity"
          >
            ▶
          </button>
        </div>
      </div>

      {/* 滾動內容區 */}
      <div className="custom-scrollbar overflow-y-auto grow pr-1">
        {isLoading ? (
          <p>Loading itinerary…</p>
        ) : error ? (
          <p>Load itinerary failed: {error.message}</p>
        ) : dayItems.length === 0 ? (
          <p style={{ opacity: 0.7, textAlign: "center" }}>今天還沒加入行程</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={dayItems.map((it) => it.item_id)} strategy={verticalListSortingStrategy}>
              <div className="grid gap-2.5">
                <div className="relative flex flex-col pl-1 md:p-4">
                
                  {/* 1. 背景時間軸垂直線 */}
                  {dayItems.length > 0 && (
                    <div className="absolute left-[15px] md:left-[27px] top-[20px] bottom-[30px] w-[2px] bg-gray-200 z-0" />
                  )}

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
                              // 外層改為 Flex，讓數字在左，卡片在右
                              <div 
                                className="flex gap-1 md:gap-4 relative pb-4"
                                style={{ zIndex: 100 - idx }}
                              >
                                
                                {/* 2. 左側時間軸圓形數字 */}
                                <div 
                                  className="shrink-0 w-6 h-6 rounded-full text-white flex items-center justify-center text-sm font-bold"
                                  style={{ backgroundColor: themeColor }}
                                >
                                  {idx + 1}
                                </div>

                                {/* 3. 右側：原本的卡片本體 */}
                                <div className="flex-1 border border-[#eee] rounded-xl p-2.5 grid grid-cols-[80px_minmax(0,1fr)_28px] gap-3 items-center bg-white shadow-sm">
                                  {/* --- 圖片區塊 --- */}
                                  <div className="w-[80px] h-[80px] rounded-lg bg-gray-200 shrink-0 overflow-hidden relative">
                                    {thumbUrl ? (
                                      <img src={thumbUrl} alt={it.place_name} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="flex items-center justify-center h-full text-sm text-gray-400">載入中</div>
                                    )}
                                  </div>

                                  {/* 中：名稱 + 時間 */}
                                  <div className="min-w-0 py-1">
                                    <div 
                                      className="font-bold text-[1.1rem] leading-tight overflow-hidden text-ellipsis cursor-pointer" 
                                      onClick={() => onUpdatePreview(it.google_place_id, it.place_name)}
                                    >
                                      {it.place_name ?? `#${it.destination_id}`}
                                    </div>
                                    <div className="mt-2 text-[13px] text-[#555] flex items-center gap-1.5 flex-wrap">
                                      <span className="text-[#8b8c8d] font-bold">抵達時間：</span>
                                      <TimePopover
                                        label=""
                                        value={arrivalValue}
                                        onApply={(value) => onApplyItemTime(it, "arrival_time", value)}
                                        onClear={() => onClearItemTime(it, "arrival_time")}
                                        compact
                                      />
                                    </div>
                                    <div className="mt-1.5 text-[13px] text-[#555] flex items-center gap-1.5 flex-wrap">
                                      <span className="text-[#8b8c8d] font-bold">離開時間：</span>
                                      <TimePopover
                                        label=""
                                        value={departureValue}
                                        onApply={(value) => onApplyItemTime(it, "departure_time", value)}
                                        onClear={() => onClearItemTime(it, "departure_time")}
                                        compact
                                      />
                                    </div>
                                  </div>

                                  {/* 右：X + ⠿  */}
                                  <div className="h-full flex flex-col justify-between items-center">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); onRemoveItem(activeDay, it.item_id); }}
                                      disabled={isRemovingItem}
                                      className="h-8 w-8 flex items-center justify-center rounded-full text-gray-500 bg-transparent text-2xl leading-none transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      ×
                                    </button>
                                    <span
                                      {...dragAttributes}
                                      {...dragListeners}
                                      onClick={(e) => e.stopPropagation()}
                                      className="cursor-grab text-black text-2xl leading-none select-none p-1 border border-[#ddd] rounded-[10px] touch-none"
                                      title="拖拉排序"
                                    >
                                      ⠿
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          }}
                        </SortableRow>

                        {/* 4. 路段交通資訊 (Leg) - 同步修改為左圖標右框的設計 */}
                        {next && legKey && (
                          <div className="flex gap-4 pb-4 relative z-10">
                            
                            {/* 交通方式小圖示 (壓在線上) */}
                            <div className="shrink-0 w-6 flex justify-center items-center">
                              <div className="bg-white py-1 text-base">
                                {currentDayLegModeMap[legKey] === "DRIVING" ? "🚘" : currentDayLegModeMap[legKey] === "WALKING" ? "👟" : currentDayLegModeMap[legKey] === "TRANSIT" ? "🚌" : ""}
                              </div>
                            </div>
                            
                            {/* 交通時間輸入框 */}
                            <div className="flex-1 rounded-[10px] py-2 px-3 bg-gray-50 border border-dashed border-gray-300 flex gap-2 items-center flex-wrap w-max self-start">
                              <span className="text-[13px] opacity-75">交通</span>
                              <select
                                value={currentDayLegModeMap[legKey] ?? ""}
                                onChange={(e) => onUpdateLegMode(legKey, e.target.value as TravelMode)}
                                className="py-1 px-2 rounded-lg border border-[#ddd] bg-white text-[13px]"
                              >
                                <option className="text-center" value="">-- : --</option>
                                <option className="text-center" value="DRIVING">開車</option>
                                <option className="text-center" value="WALKING">步行</option>
                                <option className="text-center" value="TRANSIT">大眾運輸</option>
                              </select>
                              <span className="text-[13px] opacity-85 font-bold text-gray-600">
                                {!currentDayLegModeMap[legKey] 
                                  ? "-- : --"
                                  : leg?.loading 
                                  ? "計算中…" 
                                  : leg?.error 
                                  ? `查無路線` 
                                  : `${formatDuration(leg?.durationMillis)} · ${formatDistance(leg?.distanceMeters)}`}
                              </span>
                            </div>
                          </div>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}