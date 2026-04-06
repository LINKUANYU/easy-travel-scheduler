import type { TripPlace, ItinerarySummaryRow } from "@/app/types/all-types";
import { useState, useEffect } from "react";

// 定義這個元件需要對外連接的「管線 (Props)」
interface PlacePoolPanelProps {
  days: number;
  isLoading: boolean;
  error: Error | null;
  sortedPlaces: TripPlace[];
  scheduledMap: Map<number, ItinerarySummaryRow>;
  activeDay: number;
  getThumbUrl: (placeId?: string | null) => string | undefined;
  onUpdatePreview: (placeId: string, displayName?: string) => void;
  onAddToDay: (destinationId: number, targetDay?: number) => void;
  isAdding: boolean;
  onRemovePlace: (destinationId: number) => void;
  isRemoving: boolean;
}

export default function PlacePoolPanel({
  days,
  isLoading,
  error,
  sortedPlaces,
  scheduledMap,
  activeDay,
  getThumbUrl,
  onUpdatePreview,
  onAddToDay,
  isAdding,
  onRemovePlace,
  isRemoving,
}: PlacePoolPanelProps) {

  const [openPopoverId, setOpenPopoverId] = useState<number | null>(null);

  useEffect(() => {
    if (openPopoverId === null) return;
    const closePopover = () => setOpenPopoverId(null);
    document.addEventListener("click", closePopover);
    return () => document.removeEventListener("click", closePopover);
  }, [openPopoverId]);

  return (
    <div className="border-2 border-[#4f99f9] rounded-xl p-0 flex flex-col h-full min-h-0 bg-white">
      <div className="shrink-0 pb-[10px]">
        <div className="h-[44px] flex items-center justify-center text-white bg-[#4f99f9] rounded-t-[10px] font-extrabold text-base">
          景點列表
        </div>
      </div>

      {/* 滾動內容區 */}
      <div className="grow overflow-y-auto pr-1 custom-scrollbar">
        {isLoading ? (
          <p className="p-4">Loading pool…</p>
        ) : error ? (
          <p className="p-4">Load pool failed: {error.message}</p>
        ) : sortedPlaces.length === 0 ? (
          <p className="opacity-70 text-center">還沒有加入任何景點喔！</p>
        ) : (
          <div className="px-2 pb-2">
            <ul className="list-none p-0 m-0 grid gap-2.5">
              {sortedPlaces.map((p) => {
                const scheduled = scheduledMap.get(p.destination_id);
                const thumbUrl = getThumbUrl(p.google_place_id);

                return (
                  <li 
                    key={p.destination_id} 
                    className="flex gap-3 border border-[#eee] rounded-xl p-2.5 items-center bg-white shadow-sm"
                  >
                    {/* --- 左側圖片區塊 --- */}
                    <div className="w-[80px] h-[80px] rounded-lg bg-gray-200 shrink-0 overflow-hidden relative">
                      {thumbUrl ? (
                        <img src={thumbUrl} alt={p.place_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="flex items-center justify-center h-full text-sm text-gray-400">載入中</div>
                      )}
                    </div>

                    {/* --- 中間文字區塊 --- */}
                    <div className="flex-1 min-w-0 py-1">
                      <div
                        className="font-bold text-[1.1rem] leading-tight overflow-hidden text-ellipsis cursor-pointer"
                        onClick={() => onUpdatePreview(p.google_place_id, p.place_name)}
                      >
                        {p.place_name}
                      </div>
                      {p.city_name && (
                        <div className="mt-1 text-[13px] text-[#666] line-clamp-2">
                          {p.city_name}
                        </div>
                      )}
                    </div>

                    {/* --- 右側按鈕區塊 --- */}
                    <div className="h-full flex flex-col justify-between items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemovePlace(p.destination_id);
                        }}
                        disabled={isRemoving}
                        className="h-8 w-8 flex items-center justify-center rounded-full text-gray-500 bg-transparent text-2xl leading-none transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        ×
                      </button>

                      {scheduled ? (
                        <div 
                          title={`已加入 Day ${scheduled.day_index}`} 
                          className="h-8 w-8 flex items-center justify-center rounded-full text-blue-500 bg-blue-50 cursor-default font-bold text-[12px]"
                        >
                          Day{scheduled.day_index}
                        </div>
                      ) : (
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (days === 1){
                                onAddToDay(p.destination_id, 1);
                              } else {
                                setOpenPopoverId(openPopoverId === p.destination_id ? null : p.destination_id)
                              }
                              
                            }}
                            disabled={isAdding}
                            className="h-8 w-8 flex items-center justify-center rounded-full text-blue-500 bg-blue-50 transition-colors hover:bg-blue-100 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                            title="加入行程"
                          >
                            {/* SVG 圖示 */}
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-[18px] h-[18px]">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                            </svg>
                          </button>
                          
                          {/* 如果有popover有被開啟 */}
                          {openPopoverId === p.destination_id && days > 1 && (
                            <div
                              className="absolute right-[40px] top-0 z-50 w-28 bg-white border border-gray-100 rounded-xl shadow-[0_8px_20px_rgba(0,0,0,0.12)] p-2"
                              onClick={(e) => e.stopPropagation()} // 防止點擊選單內部時觸發外部的關閉事件
                            >
                              <div className="text-[12px] text-gray-500 mb-1 px-2 font-bold">加入到...</div>
                              <div className="flex flex-col gap-1 max-h-[150px] overflow-y-auto custom-scrollbar">
                                {Array.from({ length: days }).map((_, i) => {
                                  const dayNum = i + 1;
                                  const isCurrentDay = dayNum === activeDay;
                                  return (
                                    <button
                                      key={dayNum}
                                      onClick={() => {
                                        onAddToDay(p.destination_id, dayNum);
                                        setOpenPopoverId(null); // 加入後關閉 Popover
                                      }}
                                      className={`text-left px-3 py-1.5 text-[13px] rounded-lg transition-colors ${
                                        isCurrentDay 
                                          ? "font-bold text-blue-600 bg-blue-50" 
                                          : "text-gray-700 hover:bg-gray-50"
                                      }`}
                                    >
                                      Day {dayNum}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}