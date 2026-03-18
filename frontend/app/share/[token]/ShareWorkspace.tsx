"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/app/lib/api";
import { useState, useMemo, useRef } from "react";
import TripMap from "@/app/components/planner/TripMap";
import { usePlaceThumbnails } from "@/app/hooks/usePlaceThumbnails";
import { useRouter } from "next/navigation";
import { usePlacePreview } from "@/app/hooks/usePlacePreview";
import { SharedTripDataOut } from "@/app/types/all-types";
import DayScheduleCard from "@/app/components/share/DayScheduleCard";
import { useAuth } from "@/app/context/AuthContext";
import { getTripEditToken } from "@/app/lib/tripIndex";
import toast from "react-hot-toast";

export default function ShareWorkspace({ token }: { token: string }) {
  const router = useRouter();

  // 取得全域 Auth 狀態
  const { user, openAuthModal } = useAuth();

  // 建立兩個 Ref，分別綁定給上半部卡片區，以及下半部 Tab 區
  const topListRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  /** 畫面資料顯示邏輯 */
  
  const [activeDay, setActiveDay] = useState<number | null>(1);
  // 地圖 preview 視窗 Hook 呼叫
  const { preview, setPreview, updatePreview } = usePlacePreview();

  // 讀取資料庫的trip、itinerary 資料
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

  // 把「當天 (activeDay)」有座標的景點抓出來，轉成畫線用的格式
  const activeDayRoute = useMemo(() => {
    if (!data || activeDay === null || !data.itinerary[activeDay]) return [];
    
    return data.itinerary[activeDay]
      .filter((item) => item.lat !== undefined && item.lng !== undefined) // 確保有座標
      .map((item) => ({
        lat: Number(item.lat),
        lng: Number(item.lng),
      }));
  }, [data, activeDay]);

  // 第一個參數是 dayItems，第二個是 sortedPlaces。我們直接把 map 過的 places 當作第二個參數傳進去 (用 as any[] 避開嚴格型別檢查，因為只要有 google_place_id 就能運作)
  const { getThumbUrl } = usePlaceThumbnails([], places as any[]);

  if (isLoading) return <div style={{ padding: 20 }}>載入行程中...</div>;
  if (error || !data) return <div style={{ padding: 20 }}>無法載入行程或連結已失效</div>;

  const { trip, itinerary } = data;
  // 為了方便渲染橫向的「天數」，將 Object.keys 拿到的字串陣列，透過 .map(Number) 轉成數字陣列
  const dayNums = Object.keys(itinerary).map(Number).sort((a, b) => a - b);



  /** 登入狀態邏輯 */
  // 準備攔截函式
  const handleSaveTrip = async () => {
    // 未登入：跳出註冊 Modal
    if (!user) {
      toast.success("請先註冊或登入，即可永久保存您的行程！");
      openAuthModal("register"); 
      return; // 中斷後續的儲存動作
    }

    // 已登入狀態：
    // 狀況 A：這個行程本來就是他的 (資料庫的 user_id 跟目前登入的 user.id 一致)
    if (data?.trip?.user_id === user.id) {
      toast.success("太棒了！您的行程已經儲存於帳號中囉！");
      return;
    }

    // 狀況 B (Edge Case)：他已經登入了，但這個行程是無主的 (可能他在別的視窗剛登入，這邊的資料還沒更新)
    // 我們再強制幫他打一次 bind API 確保安全
    try {
      await apiPatch(`/api/trips/${trip.trip_id}/bind`);
      toast.success("行程已成功保存至您的帳號！");
      // 建議這裡可以重整一下畫面，讓 React Query 拿到最新的擁有者狀態
      window.location.reload(); 
    } catch (err) {
      toast.error("儲存失敗，可能該行程已被其他人認領。");
    }
    
  };

  // 先去 LocalStorage 找找看edit_token
  // (確保 data 和 trip 已經載入後，才去抓 ID)
  const localEditToken = data?.trip?.trip_id 
    ? getTripEditToken(data.trip.trip_id) 
    : null;

  // 判斷當前使用者是否為該行程的擁有者 (符合以下任一條件即可)：
  // 條件 A：已登入，且資料庫紀錄的 user_id 與當前登入使用者的 id 相符。
  // 條件 B：本機端擁有這趟行程的 edit_token (代表是剛才匿名建立的作者)。
  const isOwner = Boolean(
    (user && data?.trip?.user_id && user.id === data.trip.user_id) || 
    localEditToken
  );


    /** CSS 微調邏輯 */
  // 建立一個共用的捲動函數
  const scroll = (ref: React.RefObject<HTMLDivElement | null>, offset: number) => {
    if (ref.current) {
      ref.current.scrollBy({ left: offset, behavior: "smooth" });
    }
  };


  return (
    // 最外層容器：設定為滿版畫面，並切分為上下兩塊 (flex-col)
    <div style={{ display: "flex", flexDirection: "column", backgroundColor: "#f9fafb", width: "90%", margin: "auto"}}>
      {/* 新增這段 style 來隱藏捲軸，但不影響滑動功能 */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;  /* Firefox */
        }
      `}</style>
      
      {/* 根據 isOwner 決定要顯示什麼按鈕 */}
      <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 0px", backgroundColor: "#fff", }}>
        {isOwner ? (
          <>
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
              <button 
                style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #d1d5db", backgroundColor: "#fff", cursor: "pointer", fontWeight: "bold",color: "#374151"}}
                onClick={handleSaveTrip}
              >
                保存行程
              </button>
              <button 
                onClick={() => {
                  // 呼叫瀏覽器原生 API 複製當下網址
                  navigator.clipboard.writeText(window.location.href)
                    .then(() => toast.success("分享連結已複製！"))
                    .catch(() => toast.error("複製失敗，請手動複製網址"));
                }}
                style={{ padding: "8px 16px", borderRadius: "8px", border: "none", backgroundColor: "#2563EB", color: "#fff", cursor: "pointer", fontWeight: "bold" }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#1d4ed8"}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = "#2563EB"}
              >
                分享連結
              </button>
            </div>
          </>
        ) : (
          <></>
        )}
      </div>
      {/* ========================================== */}
      {/* 上半部：橫向行程列表 (帶有左右按鈕) */}
      {/* ========================================== */}
      <div style={{ height: "80vh", position: "relative", backgroundColor: "#fff", borderBottom: "2px solid #e5e7eb", padding: "16px 0" }}>
        
        {/* 左滑按鈕 (圓形 + 陰影 + 置中) */}
        <button 
          onClick={() => scroll(topListRef, -800)} 
          style={{ 
            position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", zIndex: 10, 
            width: "40px", height: "40px", borderRadius: "50%", border: "1px solid #d1d5db", 
            backgroundColor: "#fff", cursor: "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            display: "flex", justifyContent: "center", alignItems: "center", color: "#4b5563"
          }}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: "20px", height: "20px" }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>

        {/* 捲動容器 */}
        <div 
          ref={topListRef}
          className="no-scrollbar"
          style={{ 
            height: "100%", 
            boxSizing: "border-box",
            overflowX: "auto",
            overflowY: "hidden",
            padding: "0 60px", // 左右留白避免卡片被按鈕擋住
            scrollBehavior: "smooth"
          }}
        >
          <div style={{ display: "flex", gap: "24px", height: "100%" }}>
            {dayNums.map((dayNum) => (
                <DayScheduleCard
                  key={dayNum}
                  dayNum={dayNum}
                  items={itinerary[dayNum]}
                  isActive={activeDay === dayNum}
                  onClick={() => setActiveDay((prev) => (prev === dayNum ? null : dayNum))}
                  getThumbUrl={getThumbUrl}
                  isFullWidth={false}
                />
              ))}
          </div>
        </div>

        {/* 右滑按鈕 (圓形 + 陰影 + 置中) */}
        <button 
          onClick={() => scroll(topListRef, 800)} 
          style={{ 
            position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", zIndex: 10, 
            width: "40px", height: "40px", borderRadius: "50%", border: "1px solid #d1d5db", 
            backgroundColor: "#fff", cursor: "pointer", boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            display: "flex", justifyContent: "center", alignItems: "center", color: "#4b5563"
          }}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: "20px", height: "20px" }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* ========================================== */}
      {/* 下半部：左側 1/3 每日行程切換 + 右側 2/3 地圖 */}
      {/* ========================================== */}
      <div style={{ display: "flex", height: "100vh", borderRadius: 10, gap: 10}}>
        
        {/* 左側 1/3：天數按鈕 + 單日行程 */}
        <div style={{ width: "30%", display: "flex", flexDirection: "column", backgroundColor: "#fff", border: "1px solid #d1d5db", borderRadius: 10,}}>
          
          {/* 天數切換按鈕區 (Tab - 帶有左右 SVG 按鈕) */}
          <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #e5e7eb", padding: "0 4px" }}>
            
            <button 
              onClick={() => scroll(tabsRef, -150)} 
              style={{ border: "none", background: "transparent", cursor: "pointer", padding: "12px 8px", color: "#6b7280", display: "flex", alignItems: "center" }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: "18px", height: "18px" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </button>

            <div 
              ref={tabsRef}
              className="no-scrollbar"
              style={{ display: "flex", overflowX: "auto", padding: "12px 0", gap: "8px", flex: 1, scrollBehavior: "smooth" }}
            >
              {dayNums.map((num) => (
                <button
                  key={`tab-${num}`}
                  onClick={() => setActiveDay(num)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "20px",
                    border: activeDay === num ? "none" : "1px solid #d1d5db",
                    backgroundColor: activeDay === num ? "#2563EB" : "#fff",
                    color: activeDay === num ? "#fff" : "#374151",
                    cursor: "pointer",
                    fontWeight: "bold",
                    whiteSpace: "nowrap",
                    transition: "all 0.2s"
                  }}
                >
                  第 {num} 天
                </button>
              ))}
            </div>

            <button 
              onClick={() => scroll(tabsRef, 150)} 
              style={{ border: "none", background: "transparent", cursor: "pointer", padding: "12px 8px", color: "#6b7280", display: "flex", alignItems: "center" }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: "18px", height: "18px" }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          </div>

          {/* 行程顯示區 (使用剛才抽出來的 Component) */}
          <div style={{ flex: 1, padding: "16px", overflowY: "auto", backgroundColor: "#f9fafb" }}>
            {activeDay !== null ? (
              <DayScheduleCard
                dayNum={activeDay}
                items={itinerary[activeDay]}
                isActive={false}    // 下半部不需要外框線提示
                getThumbUrl={getThumbUrl}
                isFullWidth={true}  // 填滿這個 1/3 的容器
              />
            ) : (
              <div style={{ textAlign: "center", marginTop: "40px", color: "#6b7280" }}>
                請選擇上方天數以查看詳細行程
              </div>
            )}
          </div>
        </div>

        {/* 右側 2/3：地圖區域 */}
        <div style={{ width: "70%", position: "relative" }}>
          <TripMap
            places={places}
            scheduleSummary={scheduleSummary}
            activeDay={activeDay === null ? undefined : activeDay}
            activeDayRoute={activeDayRoute}
            preview={preview}
            onClearPreview={() => setPreview(null)} 
            onPlaceClick={updatePreview}
            readonly={true} 
            isAddingPreview={false} 
            onAddPreview={() => {}}
          />
        </div>

      </div>

    </div>
  );
}