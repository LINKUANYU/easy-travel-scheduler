// app/planner/[tripId]/components/PlacePoolPanel.tsx
import React from "react";
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
    <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "white" }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>Trip 景點池</div>

      {isLoading ? (
        <p>Loading places…</p>
      ) : error ? (
        <p>Load places failed: {error.message}</p>
      ) : sortedPlaces.length === 0 ? (
        <p>尚未加入景點。</p>
      ) : (
        <div style={{ overflowY: "auto", flexGrow: 1, paddingRight: 4 }}>
          <ul style={{ padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
            {sortedPlaces.map((p) => {
              const scheduled = scheduledMap.get(p.destination_id);
              const thumbUrl = getThumbUrl(p.google_place_id);
              
              return (
                <li
                  key={p.destination_id}
                  style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, cursor: "pointer" }}
                  onClick={() => onUpdatePreview(p.google_place_id, p.place_name)}
                >
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
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
                          width: 80,
                          height: 80,
                          borderRadius: 10,
                          background: "#f3f3f3",
                          flexShrink: 0,
                          border: "1px solid #eee",
                        }}
                      />
                    )}

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 800,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
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
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    {/* 加入行程 / 已加入 */}
                    {scheduled ? (
                      <button
                        disabled
                        style={{
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          opacity: 0.6,
                        }}
                        title={`已加入 Day ${scheduled.day_index}`}
                      >
                        已加入
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // 避免點擊按鈕時觸發了整張卡片的 onClick 預覽
                          onAddToDay(p.destination_id);
                        }}
                        disabled={isAdding}
                        style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", cursor: "pointer" }}
                      >
                        {isAdding ? "Adding…" : "加入行程"}
                      </button>
                    )}

                    {/* 移除按鈕 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemovePlace(p.destination_id);
                      }}
                      disabled={isRemoving || !!scheduled}
                      style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", cursor: scheduled ? "not-allowed" : "pointer"}}
                      title={scheduled ? "此景點已加入行程，請先從行程移除" : ""}
                    >
                      {isRemoving ? "Removing…" : "移除"}
                    </button>
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