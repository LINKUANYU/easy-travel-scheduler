"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/app/lib/api";
import { useState, useMemo } from "react";
import TripMap from "@/app/planner/[tripId]/components/TripMap";
import { usePlaceThumbnails } from "@/app/planner/[tripId]/hooks/usePlaceThumbnails";
import { useRouter } from "next/navigation";
import { formatDuration } from "@/app/lib/planner/itinerary-route-leg";

// 1. 定義對應後端的資料結構
interface SharedItineraryItem {
  item_id: number;
  day_index: number;
  position: number;
  destination_id: number;
  place_name: string;
  lat?: number;
  lng?: number;
  google_place_id?: string;
  arrival_time?: string;
  departure_time?: string;
  travel_mode?: string;
  duration_millis?: number;
}

interface SharedTripDataOut {
  trip: {
    trip_id: number;
    title: string;
    days: number;
    start_date?: string;
  };
  itinerary: Record<number, SharedItineraryItem[]>;
}

export default function ShareWorkspace({ token }: { token: string }) {
  const router = useRouter();
  const [activeDay, setActiveDay] = useState<number>(1);
  
  const { data, isLoading, error } = useQuery({
    queryKey: ["shared-trip", token],
    queryFn: () => apiGet<SharedTripDataOut>(`/api/share/${token}`),
  });

  // 將後端的巢狀行程資料，轉換成 TripMap 需要的 places 和 scheduleSummary
  const { places, scheduleSummary } = useMemo(() => {
    if (!data) return { places: [], scheduleSummary: [] };
    
    const pMap = new Map(); // 用來過濾重複景點
    const summary: any[] = [];

    // 巡迴每一天的行程
    Object.values(data.itinerary).forEach((dayItems) => {
      dayItems.forEach((item) => {
        // 整理 scheduleSummary 格式
        summary.push({
          item_id: item.item_id,
          day_index: item.day_index,
          position: item.position,
          destination_id: item.destination_id
        });
        
        // 整理 places 格式 (如果同一個景點去兩次，Map 會幫我們去重)
        if (!pMap.has(item.destination_id)) {
          pMap.set(item.destination_id, {
            destination_id: item.destination_id,
            place_name: item.place_name,
            lat: Number(item.lat), // 確保轉為數字
            lng: Number(item.lng),
            google_place_id: item.google_place_id
          });
        }
      });
    });

    return { 
      places: Array.from(pMap.values()), 
      scheduleSummary: summary 
    };
  }, [data]);

  // 第一個參數是 dayItems，第二個是 sortedPlaces。我們直接把 map 過的 places 當作第二個參數傳進去 (用 as any[] 避開嚴格型別檢查，因為只要有 google_place_id 就能運作)
  const { getThumbUrl } = usePlaceThumbnails([], places as any[]);

  if (isLoading) return <div style={{ padding: 20 }}>載入行程中...</div>;
  if (error || !data) return <div style={{ padding: 20 }}>無法載入行程或連結已失效</div>;

  const { trip, itinerary } = data;
  // 為了方便渲染橫向的「天數」，將 Object.keys 拿到的字串陣列，透過 .map(Number) 轉成數字陣列
  const dayNums = Object.keys(itinerary).map(Number).sort((a, b) => a - b);

  
  return (
    // 最外層容器：設定為滿版畫面，並切分為上下兩塊 (flex-col)
    <div style={{ display: "flex", flexDirection: "column", backgroundColor: "#f9fafb", width: "90%", margin: "auto"}}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 0px", backgroundColor: "#fff", }}>
        {/* 左側按鈕 */}
        <button
          onClick={() => router.push(`/planner/${trip.trip_id}`)}
          style={{ 
          padding: "8px 16px", 
          borderRadius: "8px", 
          border: "1px solid #d1d5db", 
          backgroundColor: "#fff", 
          cursor: "pointer", 
          fontWeight: "bold",
          color: "#374151"
        }}>
          回上一步
        </button>
        
        {/* 右側按鈕 */}
        <div style={{ display: "flex", gap: "12px" }}>
          <button style={{ 
            padding: "8px 16px", 
            borderRadius: "8px", 
            border: "1px solid #d1d5db", 
            backgroundColor: "#fff", 
            cursor: "pointer", 
            fontWeight: "bold",
            color: "#374151"
          }}>
            儲存行程
          </button>
          <button style={{ 
            padding: "8px 16px", 
            borderRadius: "8px", 
            border: "none", 
            backgroundColor: "#2563EB", 
            color: "#fff", 
            cursor: "pointer", 
            fontWeight: "bold" 
          }}>
            分享路徑
          </button>
        </div>
      </div>
      {/* ========================================== */}
      {/* 上半部：橫向行程列表 */}
      {/* ========================================== */}
      <div style={{ 
        height: "calc(100vh - 180px)", 
        boxSizing: "border-box",
        minHeight: "350px",
        padding: "16px",
        overflowX: "auto",
        overflowY: "hidden",
        borderBottom: "2px solid #e5e7eb",
        backgroundColor: "#fff"
      }}>

        {/* 橫向排列的容器 */}
        <div style={{ display: "flex", gap: "24px", height: "calc(100% - 40px)" }}>
          {dayNums.map((dayNum) => (
            <div 
            key={dayNum} 
            onClick={() => setActiveDay(dayNum)}
            style={{
              minWidth: "320px", 
              backgroundColor: "#f3f4f6", 
              borderRadius: "12px", 
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              cursor: "pointer", 
              border: activeDay === dayNum ? "2px solid #000" : "2px solid transparent",
              transition: "border 0.2s ease"
            }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: "bold", margin: "0 0 16px 0", textAlign: "center" }}>
                第 {dayNum} 天
              </h2>

              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                flex: 1,
                overflowY: "auto",
                paddingRight: "4px"
              }}>
                {/* 渲染該天的所有景點 */}
                {itinerary[dayNum].length === 0 ? (
                  <div style={{ color: "#9ca3af", fontSize: "0.9rem" }}>本日尚未安排景點</div>
                ) : (
                  itinerary[dayNum].map((item) => (
                    <div key={item.item_id} style={{
                      backgroundColor: "#fff",
                      padding: "12px",
                      borderRadius: "8px",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                      display: "flex",
                      gap: "12px"
                    }}>
                      {/* 左側：景點圖片 */}
                      <div style={{
                        width: "60px",
                        height: "60px",
                        borderRadius: "6px",
                        backgroundColor: "#e5e7eb",
                        flexShrink: 0,
                        overflow: "hidden"
                      }}>
                        {getThumbUrl(item.google_place_id) ? (
                          <img 
                            src={getThumbUrl(item.google_place_id)} 
                            alt={item.place_name}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: "11px", color: "#9ca3af" }}>載入中</div>
                        )}
                      </div>

                      {/* 右側：文字資訊 */}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>{item.place_name}</div>
                        <div style={{ fontSize: "0.85rem", color: "#6b7280", fontWeight: "bold" }}>
                          時間：{item.arrival_time || "未定"} ~ {item.departure_time || "未定"}
                        </div>
                        
                        {item.travel_mode && (
                          <div style={{ fontSize: "0.8rem", color: "#3b82f6", fontWeight: "bold" }}>
                            ↓ {" "}
                            {item.travel_mode === "DRIVING" 
                              ? "開車"
                              : item.travel_mode === "WALKING" 
                              ? "步行"
                              : "大眾運輸"}
                            {item.duration_millis ? formatDuration(item.duration_millis) : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================== */}
      {/* 下半部：地圖區域 */}
      {/* ========================================== */}
      <div style={{ height: "100vh", backgroundColor: "#e5e7eb", position: "relative" }}>
        <TripMap
          places={places}
          scheduleSummary={scheduleSummary}
          activeDay={activeDay}
          preview={null}          // 唯讀模式不需要預覽點
          isAddingPreview={false} // 唯讀模式不需新增
          onAddPreview={() => {}} // 給空函式防呆
          onClearPreview={() => {}}
          topLeft={null}
          bottomRight={null}
        />
      </div>

    </div>
  );
}