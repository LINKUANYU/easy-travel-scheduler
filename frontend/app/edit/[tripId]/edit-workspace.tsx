"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet, apiPatch } from "@/app/lib/api";
import { useRouter } from "next/navigation";

import PlaceAutocompleteInput from "@/app/components/edit/PlaceAutocompleteInput";
import TripMap from "@/app/components/edit/TripMap";
import PlacePoolPanel from "../../components/edit/PlacePoolPanel";
import DailyItineraryPanel from "../../components/edit/DailyItineraryPanel";
import { usePlaceThumbnails } from "../../hooks/usePlaceThumbnails";
import { useEditData } from "../../hooks/useEditData";
import { useTripDraft } from "@/app/hooks/useTripDraft";
import toast from "react-hot-toast";
import Button from "@/app/components/ui/Button";
import LogoSpinner from "@/app/components/ui/LogoSpinner";
import { driver, DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

// 輔助函式：確保從 URL 拿到的字串 tripId 能安全轉成數字
function normalizeTripId(x: string) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export default function EditWorkspace({ tripId }: { tripId: string }) {
  const router = useRouter();
  const tid = useMemo(() => normalizeTripId(tripId), [tripId]);
  //  2 個 Tab，預設手機版顯示pool
  const [mobileTab, setMobileTab] = useState<"pool" | "itinerary">("pool");
  // 控制平板/手機模式下，地圖是否展開
  const [isMapVisible, setIsMapVisible] = useState(true);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  
  const [showLoadingUI, setShowLoadingUI] = useState(false);


  // 1. 取得設定 ActiveTrip 的方法
  const { setActiveTripId } = useTripDraft();

  // 2. 當載入這個元件時，設定當前的 tripId 為活躍狀態
  useEffect(() => {
    if (tid !== null) {
      setActiveTripId(tid);
    }
  }, [tid, setActiveTripId]);

  // 3. 抓取 Trip 基本資料 (為了取得 days 天數)
  const tripQ = useQuery({
    queryKey: ["trip", tid],
    enabled: tid !== null,
    queryFn: async () => apiGet<any>(`/api/trips/${tid}`),
  });

  // 4. 統籌所有行程與狀態資料 (等待 tid 和 trip 資料準備好才執行)
  const days = tripQ.data?.days ?? 1; 
  // 雖然 hook 必須在頂層呼叫，但因為 tid 和 days 在 loading 結束前可能不正確，
  // 我們先傳入預設值，等資料回來 React Query 會自動重新渲染。
  const data = useEditData(tid ?? 0, days);

  // 5. 統籌影像快取資料
  const { getThumbUrl } = usePlaceThumbnails(data.dayItems, data.sortedPlaces);

  // 6. 將「後端的原始資料」與「你目前拖拉的暫存順序 (data.dayItems)」進行融合，產生一個包含草稿狀態的 draftScheduleSummary，再傳給地圖。
  const draftScheduleSummary = useMemo(() => {
    const baseSummary = data.summaryQ.data ?? [];
    
    // 過濾掉「當前天數」的舊資料
    const filteredSummary = baseSummary.filter(s => s.day_index !== data.activeDay);
    
    // 將拖拉過後的暫存陣列 (data.dayItems) 轉成新的 summary 格式，並使用當下的 index 作為新 position
    const newActiveDaySummary = data.dayItems.map((item, index) => ({
      item_id: item.item_id,
      day_index: data.activeDay,
      position: index, // 👈 這裡賦予它拖拉後的新排序
      destination_id: item.destination_id,
    }));

    // 將「其他天的舊資料」跟「當天的暫存新資料」合併
    return [...filteredSummary, ...newActiveDaySummary];
  }, [data.summaryQ.data, data.dayItems, data.activeDay]);

  // 監聽 data.uiMsg，只要有文字就跳出 toast
  useEffect(() => {
    if (data.uiMsg) {
      // 判斷訊息內容是否包含負面關鍵字
      if (data.uiMsg.includes("失敗") || data.uiMsg.includes("錯誤")) {
        // 呼叫 toast.error (預設會有個紅色叉叉圖示)
        toast.error(data.uiMsg);
      } else {
        // 其他正常的訊息，呼叫 toast.success (綠色勾勾)
        toast.success(data.uiMsg);
      }
    }
  }, [data.uiMsg]);



  
  // 攔截無權限 (403) 或找不到行程 (404) 的狀態，利用 useEffect 安全地執行轉址與提示
  useEffect(() => {
    if (tripQ.error) {
      alert("您沒有權限查看此行程，或者該行程已不存在");
      router.push('/');
    }
  }, [tripQ.error, router]);

  // 等待動畫
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (tripQ.isPending) {
      timer = setTimeout(() => setShowLoadingUI(true), 300);
    } else {
      setShowLoadingUI(false);
    }
    return () => clearTimeout(timer);
  }, [tripQ.isPending]);

  // 新手導覽
  useEffect(() => {
    // 檢查 localStorage，確保使用者只會看到一次導覽
    const hasSeenTour = localStorage.getItem("hasSeenEditTour");
    
    // 如果資料還沒載入好，或是已經看過導覽，就不執行
    if (!tripQ.data || hasSeenTour) return;

    const width = window.innerWidth;
    const isMobile = width < 1200;
    const isPhone = width < 768;

    // 動態建立導覽步驟陣列
    const steps: DriveStep[] = [];

    // 步驟 1：搜尋景點 (桌機是右側輸入框，平板與手機是地圖左上角圓形按鈕)
    steps.push({
      element: isMobile ? '#tour-mobile-search-input' : '#tour-desktop-search-input',
      popover: {
        title: '搜尋景點 🔍',
        description: '從這裡輸入你想去的景點，點擊後會顯示在地圖上喔！',
        side: isMobile ? "bottom" : "right", 
        align: 'start'
      }
    });

    // 步驟 2：地圖開關 (桌機版因為地圖長駐，所以沒有開關，直接跳過此步驟！)
    if (isMobile) {
      steps.push({
        element: isMobile ? '#tour-mobile-map' : '#tour-desktop-map',
        popover: {
          title: '展開／收起地圖 🗺️',
          description: '展開／收起地圖能隨時確認到底在哪裡哦！',
          side:  isMobile ? "bottom" : "right",
          align: 'center'
        }
      });
    }

    // 步驟 3：回上一頁 (手機用左下角 FAB，平板與桌機用右上角 Header)
    steps.push({
      element: isMobile ? '#tour-mobile-back' : '#tour-desktop-back',
      popover: {
        title: '回搜尋頁 🏠',
        description: '想探索其他城市？隨時可以點這裡回到上一步。',
        side:  isMobile ? "right" : "bottom",
        align: 'center'
      }
    });

    // 步驟 4：儲存按鈕 (手機用左下角 FAB，平板與桌機用右上角 Header)
    steps.push({
      element:  isMobile ? '#tour-mobile-save' : '#tour-desktop-save',
      popover: {
        title: '記得儲存 💾',
        description: '當你加入新景點或調整順序後，記得點擊這裡儲存進度！',
        side:  isMobile ? "right" : "bottom",
        align: 'center'
      }
    });

    // 步驟 5：下一步 (手機用左下角 FAB，平板與桌機用右上角 Header)
    steps.push({
      element:  isMobile ? '#tour-mobile-next' : '#tour-desktop-next',
      popover: {
        title: '完成規劃 ✨',
        description: '行程安排好之後，點擊這裡就能進入分享頁面，把行程傳給旅伴！',
        side:  isMobile ? "right" : "bottom",
        align: 'center'
      }
    });

// 步驟 6：待排景點池 (所有裝置都適用)
    steps.push({
      element: '#tour-pool-panel', // 指向整個面板
      popover: {
        title: '待排景點池 📌',
        description: '搜尋到的景點會先放在這裡，你可以點擊「＋」將它們加入行程。點擊名稱就可以轉跳地圖！',
        // 如果是手機，對話框放上面或下面比較不會被切到；桌機則放左邊
        side: isPhone ? 'top' : 'left', 
        align: 'center'
      },
      onHighlightStarted: () => {
        // 非桌機版需要「切換」的動作
        if (isMobile) {
          setIsMapVisible(false); // 收起地圖
          setMobileTab("pool");   // 切換到景點池
        }
      }
    });

    // 步驟 7：每日行程 (所有裝置都適用)
    steps.push({
      element: '#tour-itinerary-panel', // 指向整個面板
      popover: {
        title: '每日行程 🗓️',
        description: '在這裡，點擊名稱就可以轉跳地圖，可以拖拉排序景點、設定停留時間與交通方式喔！',
        side: isPhone ? 'top' : 'left',
        align: 'center'
      },
      onHighlightStarted: () => {
        // 非桌機版需要「切換」的動作
        if (isMobile) {
          setIsMapVisible(false); // 收起地圖
          setMobileTab("itinerary"); // 切換到行程頁
        }
      }
    });

    // 初始化 Driver
    const driverObj = driver({
      showProgress: true, // 顯示進度條
      nextBtnText: '下一步 ➔',
      prevBtnText: '⬅ 上一步',
      doneBtnText: '開始規劃！',
      steps: steps,
      onDestroyStarted: () => {
        localStorage.setItem("hasSeenEditTour", "true");
        driverObj.destroy();
      }
    });

    // 延遲執行，確保畫面上的按鈕都已經渲染完畢
    setTimeout(() => {
      driverObj.drive();
    }, 500);

  }, [tripQ.data]);

  // 回上一步
  const handleGoBack = () => {
    // 去短期記憶裡面找找看上次搜了哪裡
    const lastSearch = sessionStorage.getItem("lastSearchLocation");
    
    if (lastSearch) {
      router.push(`/search?location=${lastSearch}`);
    } else {
      // 如果沒找到（例如他是直接從 Dashboard 點進來的），回首頁
      router.push('/');
    }
  };

  
  // ==========================================
  // 阻擋畫面渲染 (Loading & Error 處理)
  // ==========================================
  if (tid === null) return <p className="p-4 text-red-500 text-center mt-10">無效的行程 ID</p>;

  if (tripQ.isPending) {
    if (showLoadingUI) {
       return <LogoSpinner />;
    }
    // 300ms 內防閃爍，回傳空背景
    return <div className="h-[calc(100dvh-72px)] bg-gray-50" />;
  }

  if (!tripQ.data || tripQ.isError) {
    return null;
  }

  return (
    <div className="flex flex-col w-[95%] md:w-[90%] mx-auto h-[calc(100dvh-72px)] overflow-hidden box-border pt-2 pb-4">
      {/* 隱藏捲軸與按鈕特效的 CSS */}
      <style>{`
        /* 跳一下、停一秒的特效 */
        @keyframes jump-and-pause {
          0% { 
            transform: translateY(0);
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
          }
          15% { 
            transform: translateY(-6px); /* 跳到最高點 */
            box-shadow: 0 10px 20px rgba(37, 99, 235, 0.6);
          }
          30% { 
            transform: translateY(0); /* 回到原點，完成一次跳動 */
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
          }
          100% { 
            /* 從 30% 到 100% 的時間都會停留在這裡，形成靜止狀態 */
            transform: translateY(0);
            box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
          }
        }
        
        .map-btn-pop {
          /* 總時間設定為 2 秒 */
          animation: jump-and-pause 2s infinite ease-in-out;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white !important;
          border: none !important;
          transition: all 0.3s ease;
        }
        
        .map-btn-pop:hover {
          transform: scale(1.05) translateY(-2px);
          box-shadow: 0 6px 16px rgba(37, 99, 235, 0.5);
          animation-play-state: paused; /* 游標放上去時停止跳動 */
        }
      `}</style>

      {/* ========================================= */}
      {/* 1. 手機版專屬：3 Tab 切換導覽列 (< 768px 顯示) */}
      {/* ========================================= */}
      <div className={`${isMapVisible ? "hidden" : "flex"} md:hidden bg-gray-100 p-1 rounded-xl shrink-0 gap-1`}>
        <button
          id="tour-mobile-pool-tab"
          onClick={() => setMobileTab("pool")}
          className={`flex-1 py-2 text-[13px] font-bold rounded-lg transition-colors ${mobileTab === "pool" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"}`}
        >
          📌 待排景點
        </button>
        <button
          id="tour-mobile-itinerary-tab"
          onClick={() => setMobileTab("itinerary")}
          className={`flex-1 py-2 text-[13px] font-bold rounded-lg transition-colors ${mobileTab === "itinerary" ? "bg-white text-blue-600 shadow-sm" : "text-gray-500"}`}
        >
          🗓️ 每日行程
        </button>
      </div>
      {/* ========================================= */}
      {/* 2. 主版面區塊 (結合了地圖與內容區) */}
      {/* ========================================= */}
      <div className="flex flex-col min-[1200px]:grid min-[1200px]:grid-cols-[4fr_6fr] gap-5 flex-1 min-h-0 relative">

        {/* --------------------------------- */}
        {/* 左側 ：地圖區塊 */}
        {/* --------------------------------- */}
        <div className={`
          ${isMapVisible 
            ? "relative w-full flex-1 opacity-100 z-10" // 手機/平板展開時：佔滿空間
            : "absolute top-0 left-0 w-full h-full opacity-0 -z-10 pointer-events-none min-[1200px]:pointer-events-auto" // 手機/平板隱藏時：退到背景。★ 修正：加上 min-[1200px]:pointer-events-auto 讓桌機版永遠可點擊！
          } 
          min-[1200px]:!relative min-[1200px]:!w-auto min-[1200px]:!h-auto min-[1200px]:!opacity-100 min-[1200px]:!z-10 min-[1200px]:!flex min-[1200px]:!flex-col
          border border-[#ddd] rounded-xl overflow-hidden shadow-md transition-opacity duration-300
        `}>
          <TripMap
            places={data.places}
            scheduleSummary={draftScheduleSummary}
            activeDay={data.activeDay}
            preview={data.preview}
            isAddingPreview={data.addPlaceM.isPending}
            onAddPreview={(placeId) => {
              const exists = data.places.some((p) => p.google_place_id === placeId);
              if (exists) return;
              data.addPlaceM.mutate(placeId);
            }}
            onClearPreview={() => data.setPreview(null)}
            onPlaceClick={(placeId) => data.updatePreview(placeId)}
            defaultCityName={
              typeof window !== 'undefined' 
              ? sessionStorage.getItem("lastSearchLocation") || tripQ?.data?.title 
              : undefined}
          />
          
          {/* 未展開時的圓形搜尋按鈕 */}
          {!isMobileSearchOpen && isMapVisible && (
            <button
              id="tour-mobile-search-input" 
              onClick={() => setIsMobileSearchOpen(true)}
              className="min-[1200px]:hidden absolute top-1 left-1 z-20 w-11 h-11 bg-white rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.15)] flex items-center justify-center text-slate-600 border border-slate-100 active:scale-90 transition-transform"
            >
              <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </button>
          )}

          {/* 實際的搜尋框區塊 */}
          <div className={`
            ${isMobileSearchOpen 
              ? "fixed inset-0 z-[9999] w-full h-full bg-white p-4 flex flex-col" 
              : "absolute top-3 left-3 z-10 w-[90%] max-w-[360px] bg-white p-2.5 rounded-xl shadow-[0_8px_20px_rgba(0,0,0,0.12)] border border-gray-100 hidden min-[1200px]:block"
            }
          `}>
            {isMobileSearchOpen && (
              <div className="min-[1200px]:hidden flex items-center gap-3 mb-4 pb-3 border-b border-gray-100 mt-20">
                <button 
                  onClick={() => setIsMobileSearchOpen(false)}
                  className="p-1 text-slate-500 hover:text-slate-800"
                >
                  <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <span className="font-bold text-lg text-slate-800">搜尋地點</span>
              </div>
            )}

            {/* Google Input */}
            <div id="tour-desktop-search-input" className="w-full">
              <PlaceAutocompleteInput
                disabled={data.previewLoading}
                placeholder="搜尋並選擇地點（Google Places）"
                onPick={({placeId, label}) => {
                  data.updatePreview(placeId, label);
                  setIsMobileSearchOpen(false); // 選取後自動收起全螢幕
                }}
              />
            </div>
            
            {/* 預覽載入狀態 */}
            {(data.previewLoading || data.previewErr) && (
              <div className="text-[13px] opacity-80 mt-2">
                {data.previewLoading ? "載入預覽中…" : `預覽失敗：${data.previewErr}`}
              </div>
            )}
          </div>
        </div>

        {/* --------------------------------- */}
        {/* 右側 ：內容區塊 (標題 + 景點池 + 行程) */}
        {/* --------------------------------- */}
        <div className={`
          ${isMapVisible ? "hidden" : "flex"} 
          w-full flex-col min-h-0 flex-1 /* 這裡也補上 flex-1，確保行程區塊永遠撐滿螢幕剩餘高度 */
          min-[1200px]:!flex min-[1200px]:!w-auto min-[1200px]:!flex-1
        `}>
              
          {/* --- 標題列與操作列 --- */}
          <div className="flex items-center justify-center md:justify-between shrink-0 px-2 mb-2">
            <div>
              <p className="font-extrabold hidden md:block text-[20px] md:text-[28px] text-[#111]">
                {tripQ?.data.title}
                <span className="ml-3 text-[14px] md:text-base text-[#666] font-medium md:inline mt-1 md:mt-0">
                  {tripQ?.data.days} Days {tripQ?.data.start_date ? `- ${tripQ?.data.start_date}` : ""}
                </span>
              </p>
            </div>

            {/* 桌機版按鈕群 (大於 1200px 顯示) */}
            <div className="hidden md:flex gap-3">
              {/* 1. 地圖開關 */}
              <button
                id="tour-desktop-map"
                onClick={() => setIsMapVisible(!isMapVisible)}
                className="min-[1200px]:hidden map-btn-pop w-10 h-10 flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-full shadow-[0_4px_12px_rgba(37,99,235,0.3)] active:scale-90 transition-transform"
                title={isMapVisible ? "收起地圖" : "展開地圖"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                  {isMapVisible ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  )}
                </svg>
              </button>
              {/* 2. 回上一頁 */}
              <button
                id="tour-desktop-back"
                onClick={handleGoBack}
                className="w-10 h-10 flex items-center justify-center bg-white text-slate-700 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-slate-100 active:scale-90 transition-transform"
                title="回上一頁"
              >
                <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
                </svg>
              </button>
              
              {/* 3. 儲存按鈕 */}
              <button
                id="tour-desktop-save"
                onClick={() => data.saveDayDraftM.mutate(data.activeDay)}
                disabled={data.saveDayDraftM.isPending}
                className={`relative w-10 h-10 flex items-center justify-center rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-90 transition-transform 
                  ${!!data.dirtyDayMap[data.activeDay] ? "bg-[#FFA08B] text-white border-none" : "bg-white text-slate-700 border border-slate-100"}`
                }
                title="儲存變更"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-[18px] h-[18px]">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-8H7v8M7 3v5h8" />
                </svg>
                {!!data.dirtyDayMap[data.activeDay] && (
                  <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 border-2 border-white rounded-full"></span>
                )}
              </button>

              {/* 4. 下一步 */}
              <button
                id="tour-desktop-next"
                onClick={async () => {
                  try {
                    const res = await apiPatch<{ share_token: string }>(`/api/trips/${tid}/share`);
                    router.push(`/share/${res.share_token}`);
                  } catch (err) {
                    console.error(err);
                    alert("進入下一頁失敗，請稍後再試！");
                  }
                }}
                className="w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-full shadow-[0_4px_12px_rgba(0,100,255,0.3)] active:scale-90 transition-transform"
                title="分享並完成"
              >
                <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </button>
            </div>
          </div>

          {/* --- 景點池 & 每日行程 容器 --- */}
          <div className="flex flex-col md:flex-row gap-5 flex-1 min-h-0 w-full">
            
            {/* 景點池 (手機版依據 Tab 切換，平板/桌機版永遠顯示並佔 50%/自訂比例) */}
            <div 
              id="tour-pool-panel"
              className={`
                ${mobileTab === "pool" ? "flex" : "hidden"} 
                md:flex flex-col min-h-0 w-full md:w-1/2 min-[1200px]:w-auto min-[1200px]:!flex-[2.5]
            `}>
              <PlacePoolPanel
                days={days}
                isLoading={data.placesQ.isLoading}
                error={data.placesQ.error as Error | null}
                sortedPlaces={data.sortedPlaces}
                scheduledMap={data.scheduledMap}
                activeDay={data.activeDay}
                getThumbUrl={getThumbUrl}
                onUpdatePreview={(placeId, name) => {
                  data.updatePreview(placeId, name);
                  setIsMapVisible(true);
                }}
                onAddToDay={(destination_id, targetDay = data.activeDay) => 
                  data.addToDayM.mutate({ dayIndex: targetDay, destination_id })
                }
                isAdding={data.addToDayM.isPending}
                onRemovePlace={(destination_id) => data.removePlaceM.mutate(destination_id)}
                isRemoving={data.removePlaceM.isPending}
              />
            </div>

            {/* 每日行程 (手機版依據 Tab 切換，平板/桌機版永遠顯示並佔 50%/自訂比例) */}
            <div 
              id="tour-itinerary-panel"
              className={`
                ${mobileTab === "itinerary" ? "flex" : "hidden"} 
                md:flex flex-col min-h-0 w-full md:w-1/2 min-[1200px]:w-auto min-[1200px]:!flex-[3.5]
            `}>
              <DailyItineraryPanel
                activeDay={data.activeDay}
                days={days}
                onPrevDay={data.prevDay}
                onNextDay={data.nextDay}
                isLoading={data.dayItinQ.isLoading}
                error={data.dayItinQ.error as Error | null}
                dayItems={data.dayItems}
                legRouteMap={data.legRouteMap}
                currentDayLegModeMap={data.currentDayLegModeMap}
                onDragEnd={data.onDragEnd}
                getThumbUrl={getThumbUrl}
                onUpdatePreview={(placeId, name) => {
                  data.updatePreview(placeId, name);
                  setIsMapVisible(true);
                }}
                getItemTimeValue={data.getItemTimeValue}
                onApplyItemTime={data.applyItemTime}
                onClearItemTime={data.clearItemTime}
                onRemoveItem={(dayIndex, item_id) => data.removeItemM.mutate({ dayIndex, item_id })}
                isRemovingItem={data.removeItemM.isPending}
                onUpdateLegMode={data.updateCurrentDayLegMode}
              />
            </div>

          </div>
        </div>

      </div>

      {/* ========================================= */}
      {/* 3. 浮動操作按鈕 (FAB) - 小於 1200px 顯示 */}
      {/* ========================================= */}
      <div className={`
        flex flex-col fixed bottom-6 left-3 gap-4 z-[100] min-[1200px]:hidden
        ${!isMapVisible ? "md:hidden" : ""}
      `}>
        {/* 1. 地圖開關 */}
        <button
          id="tour-mobile-map"
          onClick={() => setIsMapVisible(!isMapVisible)}
          className="map-btn-pop w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-full shadow-[0_4px_12px_rgba(37,99,235,0.3)] active:scale-90 transition-transform"
          title={isMapVisible ? "收起地圖" : "展開地圖"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
            {isMapVisible ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            )}
          </svg>
        </button>

        {/* 2. 回上一頁 */}
        <button
          id="tour-mobile-back"
          onClick={handleGoBack}
          className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-white text-slate-700 rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.15)] border border-slate-100 active:scale-90 transition-transform"
          title="回上一頁"
        >
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
          </svg>
        </button>

        {/* 3. 儲存變更 */}
        <button
          id="tour-mobile-save"
          onClick={() => data.saveDayDraftM.mutate(data.activeDay)}
          disabled={data.saveDayDraftM.isPending}
          className={`relative w-10 h-10 md:w-12 md:h-12 flex items-center justify-center rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.15)] active:scale-90 transition-transform 
            ${!!data.dirtyDayMap[data.activeDay] ? "bg-[#FFA08B] text-white border-none" : "bg-white text-slate-700 border border-slate-100"}`
          }
          title="儲存變更"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-[18px] h-[18px]">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 21v-8H7v8M7 3v5h8" />
          </svg>
          
          {!!data.dirtyDayMap[data.activeDay] && (
            <span className="absolute top-0 right-0 w-3.5 h-3.5 md:w-4 md:h-4 bg-red-500 border-2 border-white rounded-full"></span>
          )}
        </button>

        {/* 4. 下一步 */}
        <button
          id="tour-mobile-next"
          onClick={async () => {
            try {
              const res = await apiPatch<{ share_token: string }>(`/api/trips/${tid}/share`);
              router.push(`/share/${res.share_token}`);
            } catch (err) {
              console.error(err);
              alert("進入下一頁失敗，請稍後再試！");
            }
          }}
          className="w-10 h-10 md:w-12 md:h-12 flex items-center justify-center bg-gray-800 text-white rounded-full shadow-[0_4px_12px_rgba(0,0,0,0.3)] active:scale-90 transition-transform"
          title="完成並分享"
        >
          <svg fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </button>

      </div>
    </div>
  );
}
