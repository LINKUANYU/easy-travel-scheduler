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
      className={`
        w-[300px] shrink-0 h-max bg-white rounded-xl flex flex-col 
        shadow-md overflow-hidden transition-all duration-200 ease-in-out
        ${onClick ? "cursor-pointer" : "cursor-default"}
        ${isActive ? "border-2" : "border border-gray-200"}
      `}
      style={{
        borderColor: isActive ? themeColor : undefined
      }}
    >
      {/* --- 卡片標題區 (帶有背景色) --- */}
      <div 
        className="px-4 py-3 flex items-center gap-2 text-white"
        style={{ backgroundColor: themeColor }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
        </svg>
        <h2 className="text-[1.1rem] font-bold m-0">
          Day {dayNum}
        </h2>
      </div>

      {/* --- 行程內容區 (時間軸設計) --- */}
      <div className="relative flex flex-col p-4">
        
        {/* 背景時間軸垂直線 */}
        {items.length > 0 && (
          <div className="absolute left-[27px] top-[30px] bottom-[30px] w-[2px] bg-gray-200 z-0" />
        )}

        {items.length === 0 ? (
          <div className="text-gray-400 text-[0.9rem] text-center mt-5">
            本日尚未安排景點
          </div>
        ) : (
          items.map((item, index) => (
            <div key={item.item_id} className="flex flex-col relative z-10">
              
              {/* 單一景點區塊 */}
              <div className="flex gap-4">
                {/* 左側時間軸圖示 */}
                <div 
                  className="shrink-0 w-6 h-6 rounded-full text-white flex items-center justify-center text-base font-bold"
                  style={{ backgroundColor: themeColor }}
                >
                  {item.position + 1}
                </div>

                {/* 右側資訊與圖片 */}
                <div className="flex-1 pb-2.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-[0.85rem] text-[#096ffc]">
                        抵達時間：{item.arrival_time || "未定"}
                      </div>
                      <div className="font-bold text-[1.1rem] text-gray-900 mt-0.5 mb-2">
                        {item.place_name}
                      </div>
                    </div>
                  </div>

                  {/* 大尺寸景點圖片 */}
                  {getThumbUrl(item.google_place_id) && (
                    <div className="h-32 rounded-lg overflow-hidden relative">
                      <img 
                        src={getThumbUrl(item.google_place_id)} 
                        alt={item.place_name} 
                        className="w-full h-full object-cover" 
                      />
                    </div>
                  )}

                  <div className="text-[0.85rem] text-[#096ffc] mt-1.5">
                    離開時間：{item.departure_time || "未定"}
                  </div>

                </div>
              </div>

              {/* 交通連接區塊 */}
              {item.travel_mode && index < items.length - 1 && (
                <div className="flex gap-4 pb-5 opacity-80">
                  <div className="shrink-0 w-6 flex justify-center">
                    <div className="bg-white py-0.5">
                      {/* 交通工具小圖示 */}
                      {item.travel_mode === "DRIVING" ? "🚘" : item.travel_mode === "WALKING" ? "👟" : "🚌"}
                    </div>
                  </div>
                  <div className="flex-1 text-[0.75rem] text-gray-500 bg-gray-100 px-3 py-1.5 rounded-md w-max self-start">
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
}