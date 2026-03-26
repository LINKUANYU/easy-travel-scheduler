import { SharedItineraryItem } from "@/app/types/all-types";
import { formatDuration } from "@/app/lib/edit/itinerary-route-leg";



interface DayScheduleCardProps {
  dayNum: number;
  items: SharedItineraryItem[];
  isActive: boolean;
  onClick?: () => void;
  getThumbUrl: (id?: string | null) => string | undefined;
  isFullWidth?: boolean; // 控制是否要佔滿父元素寬度
}

  const DAY_COLORS = ["#71b5c8", "#82cda4", "#f8cb42", "#e76f51", "#b97ced"];

export default function DayScheduleCard({ dayNum, items, isActive, onClick, getThumbUrl}: DayScheduleCardProps) {
  

  const themeColor = DAY_COLORS[(dayNum - 1) % DAY_COLORS.length];

  return (
    <div 
      onClick={onClick}
      style={{
        width: "260px",
        flexShrink: 0,  // 防止卡片在橫向排列時被外層容器壓縮
        height: "max-content",
        backgroundColor: "#fff", 
        borderRadius: "12px", 
        display: "flex",
        flexDirection: "column",
        cursor: onClick ? "pointer" : "default", 
        border: isActive ? `2px solid ${themeColor}` : "1px solid #e5e7eb",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
        overflow: "hidden", // 讓頂部顏色塊的圓角能生效
        transition: "all 0.2s ease"
      }}
    >
      {/* --- 卡片標題區 (帶有背景色) --- */}
      <div style={{ 
        backgroundColor: themeColor, 
        padding: "12px 16px", 
        display: "flex", 
        alignItems: "center", 
        gap: "8px",
        color: "#fff" 
      }}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: "20px", height: "20px" }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
        <h2 style={{ fontSize: "1.1rem", fontWeight: "bold", margin: 0 }}>
          Day {dayNum}
        </h2>
      </div>

      {/* --- 行程內容區 (時間軸設計) --- */}
      <div style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        padding: "16px",
      }}>
        
        {/* 背景時間軸垂直線 */}
        {items.length > 0 && (
          <div style={{
            position: "absolute",
            left: "27px", // 對齊圖示中心
            top: "30px",
            bottom: "30px",
            width: "2px",
            backgroundColor: "#e5e7eb",
            zIndex: 0
          }} />
        )}

        {items.length === 0 ? (
          <div style={{ color: "#9ca3af", fontSize: "0.9rem", textAlign: "center", marginTop: "20px" }}>本日尚未安排景點</div>
        ) : (
          items.map((item, index) => (
            <div key={item.item_id} style={{ display: "flex", flexDirection: "column", position: "relative", zIndex: 1 }}>
              
              {/* 單一景點區塊 */}
              <div style={{ display: "flex", gap: "16px" }}>
                {/* 左側時間軸圖示 */}
                <div style={{ flexShrink: 0, width: "24px", height: "24px", borderRadius: "50%", backgroundColor: themeColor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", fontWeight: "bold" }}>
                  {item.position + 1}
                </div>

                {/* 右側資訊與圖片 */}
                <div style={{ flex: 1, paddingBottom: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ fontSize: "0.85rem", color: "#096ffc" }}>
                        抵達時間：{item.arrival_time || "未定"}
                      </div>
                      <div style={{ fontWeight: "bold", fontSize: "1.1rem", color: "#111827", marginTop: "2px", marginBottom: "8px" }}>
                        {item.place_name}
                      </div>
                    </div>
                    {/* 右上角更多選項 (選單圖示) */}
                  </div>

                  {/* 大尺寸景點圖片 */}
                  {getThumbUrl(item.google_place_id) && (
                    <div style={{ width: "96px", height: "96px", borderRadius: "8px", overflow: "hidden", position: "relative" }}>
                      <img src={getThumbUrl(item.google_place_id)} alt={item.place_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  )}

                  <div style={{ fontSize: "0.85rem", color: "#096ffc", marginTop: "6px" }}>
                    離開時間：{item.departure_time || "未定"}
                  </div>

                </div>
              </div>

              {/* 交通連接區塊 (如果不是最後一個景點，且有交通資訊) */}
              {item.travel_mode && index < items.length - 1 && (
                <div style={{ display: "flex", gap: "16px", paddingBottom: "20px", opacity: 0.8 }}>
                  <div style={{ flexShrink: 0, width: "24px", display: "flex", justifyContent: "center" }}>
                    <div style={{ backgroundColor: "#fff", padding: "2px 0" }}>
                      {/* 交通工具小圖示 */}
                      {item.travel_mode === "DRIVING" ? "🚘" : item.travel_mode === "WALKING" ? "👟" : "🚌"}
                    </div>
                  </div>
                  <div style={{ flex: 1, fontSize: "0.75rem", color: "#6b7280", backgroundColor: "#f3f4f6", padding: "6px 12px", borderRadius: "6px", width: "max-content", alignSelf: "flex-start" }}>
                    {item.travel_mode === "DRIVING" ? "開車" : item.travel_mode === "WALKING" ? "步行" : "大眾運輸"}
                    {item.duration_millis ? ` · 約 ${formatDuration(item.duration_millis)}` : ' 沒有資訊'}
                  </div>
                </div>
              )}

            </div>
          ))
        )}
      </div>
      
    </div>
  );

  // return (
  //   <div 
  //     onClick={onClick}
  //     style={{
  //       minWidth: isFullWidth ? "auto" : "320px", // 上半部維持 320px，下半部 auto
  //       width: isFullWidth ? "100%" : "auto",     // 下半部填滿容器
  //       backgroundColor: "#f3f4f6", 
  //       borderRadius: "12px", 
  //       padding: "16px",
  //       display: "flex",
  //       flexDirection: "column",
  //       cursor: onClick ? "pointer" : "default", 
  //       border: isActive ? "2px solid #000" : "2px solid transparent",
  //       transition: "border 0.2s ease"
  //     }}
  //   >
  //     <h2 style={{ fontSize: "1.1rem", fontWeight: "bold", margin: "0 0 16px 0", textAlign: "center" }}>
  //       第 {dayNum} 天
  //     </h2>

  //     <div style={{
  //       display: "flex",
  //       flexDirection: "column",
  //       gap: "12px",
  //       flex: 1,
  //       overflowY: "auto",
  //       paddingRight: "4px"
  //     }}>
  //       {items.length === 0 ? (
  //         <div style={{ color: "#9ca3af", fontSize: "0.9rem" }}>本日尚未安排景點</div>
  //       ) : (
  //         items.map((item) => (
  //           <div key={item.item_id} style={{
  //             backgroundColor: "#fff",
  //             padding: "12px",
  //             borderRadius: "8px",
  //             boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  //             display: "flex",
  //             gap: "12px"
  //           }}>
  //             {/* --- 圖片區塊 --- */}
  //             <div style={{ width: "60px", height: "60px", borderRadius: "6px", backgroundColor: "#e5e7eb", flexShrink: 0, overflow: "hidden", position: "relative" }}>
  //               {getThumbUrl(item.google_place_id) ? (
  //                 <img src={getThumbUrl(item.google_place_id)} alt={item.place_name} style={{ width: "100%", height: "100%", objectFit: "cover"}} />
  //               ) : (
  //                 <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: "11px", color: "#9ca3af" }}>載入中</div>
  //               )}
  //               {/* 👈 2. 加入 position 數值標籤 */}
  //               <div
  //                 style={{
  //                   position: "absolute",
  //                   top: "0",
  //                   left: "0",
  //                   backgroundColor: "rgba(0, 0, 0, 0.6)", // 半透明黑底
  //                   color: "#fff", // 白色文字
  //                   padding: "2px 6px", // 內邊距
  //                   fontSize: "12px", // 字體大小
  //                   fontWeight: "bold",
  //                   borderRadius: "6px", // 圓角右下角
  //                   zIndex: 1, // 確保標籤在圖片上方
  //                 }}
  //               >
  //                 {item.position + 1}
  //               </div>
  //             </div>


  //             {/* --- 文字資訊區塊 --- */}
  //             <div style={{ flex: 1 }}>
  //               <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>{item.place_name}</div>
  //               <div style={{ fontSize: "0.85rem", color: "#6b7280", fontWeight: "bold" }}>
  //                 時間：{item.arrival_time || "未定"} ~ {item.departure_time || "未定"}
  //               </div>
  //               {item.travel_mode && (
  //                 <div style={{ fontSize: "0.8rem", color: "#3b82f6", fontWeight: "bold" }}>
  //                   ↓ {item.travel_mode === "DRIVING" ? "開車" : item.travel_mode === "WALKING" ? "步行" : "大眾運輸"}
  //                   {item.duration_millis ? formatDuration(item.duration_millis) : ''}
  //                 </div>
  //               )}
  //             </div>
  //           </div>
  //         ))
  //       )}
  //     </div>
  //   </div>
  // );
}