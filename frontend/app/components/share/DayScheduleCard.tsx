import { SharedItineraryItem } from "@/app/types/all-types";
import { formatDuration } from "@/app/lib/planner/itinerary-route-leg";



interface DayScheduleCardProps {
  dayNum: number;
  items: SharedItineraryItem[];
  isActive: boolean;
  onClick?: () => void;
  getThumbUrl: (id?: string | null) => string | undefined;
  isFullWidth?: boolean; // 控制是否要佔滿父元素寬度
}

export default function DayScheduleCard({ dayNum, items, isActive, onClick, getThumbUrl, isFullWidth = false }: DayScheduleCardProps) {
  return (
    <div 
      onClick={onClick}
      style={{
        minWidth: isFullWidth ? "auto" : "320px", // 上半部維持 320px，下半部 auto
        width: isFullWidth ? "100%" : "auto",     // 下半部填滿容器
        backgroundColor: "#f3f4f6", 
        borderRadius: "12px", 
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        cursor: onClick ? "pointer" : "default", 
        border: isActive ? "2px solid #000" : "2px solid transparent",
        transition: "border 0.2s ease"
      }}
    >
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
        {items.length === 0 ? (
          <div style={{ color: "#9ca3af", fontSize: "0.9rem" }}>本日尚未安排景點</div>
        ) : (
          items.map((item) => (
            <div key={item.item_id} style={{
              backgroundColor: "#fff",
              padding: "12px",
              borderRadius: "8px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
              display: "flex",
              gap: "12px"
            }}>
              {/* --- 圖片區塊 --- */}
              <div style={{ width: "60px", height: "60px", borderRadius: "6px", backgroundColor: "#e5e7eb", flexShrink: 0, overflow: "hidden", position: "relative" }}>
                {getThumbUrl(item.google_place_id) ? (
                  <img src={getThumbUrl(item.google_place_id)} alt={item.place_name} style={{ width: "100%", height: "100%", objectFit: "cover"}} />
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: "11px", color: "#9ca3af" }}>載入中</div>
                )}
                {/* 👈 2. 加入 position 數值標籤 */}
                <div
                  style={{
                    position: "absolute",
                    top: "0",
                    left: "0",
                    backgroundColor: "rgba(0, 0, 0, 0.6)", // 半透明黑底
                    color: "#fff", // 白色文字
                    padding: "2px 6px", // 內邊距
                    fontSize: "12px", // 字體大小
                    fontWeight: "bold",
                    borderRadius: "6px", // 圓角右下角
                    zIndex: 1, // 確保標籤在圖片上方
                  }}
                >
                  {item.position + 1}
                </div>
              </div>


              {/* --- 文字資訊區塊 --- */}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>{item.place_name}</div>
                <div style={{ fontSize: "0.85rem", color: "#6b7280", fontWeight: "bold" }}>
                  時間：{item.arrival_time || "未定"} ~ {item.departure_time || "未定"}
                </div>
                {item.travel_mode && (
                  <div style={{ fontSize: "0.8rem", color: "#3b82f6", fontWeight: "bold" }}>
                    ↓ {item.travel_mode === "DRIVING" ? "開車" : item.travel_mode === "WALKING" ? "步行" : "大眾運輸"}
                    {item.duration_millis ? formatDuration(item.duration_millis) : ''}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}