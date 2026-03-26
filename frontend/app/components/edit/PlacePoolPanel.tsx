// app/edit/[tripId]/components/PlacePoolPanel.tsx

import type { TripPlace, ItinerarySummaryRow } from "@/app/types/all-types";

// 定義這個元件需要對外連接的「管線 (Props)」
interface PlacePoolPanelProps {
  isLoading: boolean;
  error: Error | null;
  sortedPlaces: TripPlace[];
  scheduledMap: Map<number, ItinerarySummaryRow>;
  activeDay: number;
  getThumbUrl: (placeId?: string | null) => string | undefined;
  onUpdatePreview: (placeId: string, displayName?: string) => void;
  onAddToDay: (destinationId: number) => void;
  isAdding: boolean;
  onRemovePlace: (destinationId: number) => void;
  isRemoving: boolean;
}

export default function PlacePoolPanel({
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
  return (
    <div style={{ border: "2px solid #4f99f9", borderRadius: 12, padding: "0px 0px", display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "white" }}>
      <div style={{ flexShrink: 0, paddingBottom: "10px" }}>
        <div style={{ 
          height: "44px", 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center",
          backgroundColor:  "#4f99f9",
          color: "#fff",
          borderRadius: "10px 10px 0 0",
          fontWeight: 800, 
          fontSize: "16px" 
        }}>
          景點列表
        </div>
      </div>

      {isLoading ? (
        <p>Loading places…</p>
      ) : error ? (
        <p>Load places failed: {error.message}</p>
      ) : sortedPlaces.length === 0 ? (
        <p style={{ opacity: 0.7, textAlign: "center" }}>尚未加入景點。</p>
      ) : (
        <div className="custom-scrollbar" style={{ overflowY: "auto", flexGrow: 1, paddingRight: 4 }}>
          <ul style={{ padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
            {sortedPlaces.map((p) => {
              const scheduled = scheduledMap.get(p.destination_id);
              const thumbUrl = getThumbUrl(p.google_place_id);
              
              return (
                <li
                  key={p.destination_id}
                  style={{ border: "1px solid #eee", borderRadius: 12, padding: 10, cursor: "pointer", display: "flex", gap: 12, alignItems: "stretch" }}
                  onClick={() => onUpdatePreview(p.google_place_id, p.place_name)}
                >
                  {/* --- 左側：圖片區 --- */}
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={p.place_name ?? "place"}
                      style={{
                        width: 72,
                        height: 72,
                        objectFit: "cover",
                        borderRadius: 10,
                        flexShrink: 0,
                        border: "1px solid #eee",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 10,
                        background: "#f3f3f3",
                        flexShrink: 0,
                        border: "1px solid #eee",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        color: "#9ca3af"
                      }}
                    >
                      載入中
                    </div>
                  )}

                  {/* --- 中間：文字區 --- */}
                  <div style={{ minWidth: 0, flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <div
                      style={{
                        fontWeight: 800,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        lineHeight: 1.3
                      }}
                    >
                      {p.place_name ?? `#${p.destination_id}`}
                    </div>

                    <div
                      style={{
                        fontSize: 13,
                        opacity: 0.75,
                        marginTop: 4,
                        wordBreak: "break-all",
                      }}
                    >
                      {p.city_name ? `${p.city_name} ` : ""}
                    </div>
                  </div>

                  {/* --- 右側：按鈕區 (上下排列) --- */}
                  <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center", flexShrink: 0, width: "32px" }}>
                    
                    {/* 上：移除按鈕 (X) - 樣式與行程表同步 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemovePlace(p.destination_id);
                      }}
                      disabled={isRemoving || !!scheduled}
                      className="h-8 w-8 flex items-center justify-center rounded-full text-gray-500 bg-transparent text-2xl leading-none transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed"
                      title={scheduled ? "此景點已加入行程，請先從行程移除" : "移除景點"}
                    >
                      ×
                    </button>

                    {/* 下：加入行程按鈕 (箭頭) / 已加入 (打勾) */}
                    {scheduled ? (
                      <div 
                        title={`已加入 Day ${scheduled.day_index}`} 
                        className="h-8 w-8 flex items-center justify-center rounded-full text-blue-500 bg-blue-50 cursor-default font-bold text-[12px]"
                      >
                        Day{scheduled.day_index}
                      </div>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddToDay(p.destination_id);
                        }}
                        disabled={isAdding}
                        className="h-8 w-8 flex items-center justify-center rounded-full text-blue-500 bg-blue-50 transition-colors hover:bg-blue-100 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                        title="加入行程"
                      >
                        {/* 箭頭 SVG 圖示 */}
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" style={{ width: "18px", height: "18px" }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                        </svg>
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}