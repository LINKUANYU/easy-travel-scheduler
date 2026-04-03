"use client"; // 告訴 Next.js 這是在瀏覽器執行的元件

import { useState, useEffect} from "react";
import { useQuery } from "@tanstack/react-query";
import SearchPanel from "@/app/components/home/SearchPanel";
import { apiGet } from "@/app/lib/api";
import { useRouter } from "next/navigation";
import CreateTripModal from "./components/home/CreateTripModal";
import { useTripDraft } from "./hooks/useTripDraft";
import AddPlacesToTripBtn from "./components/home/AddPlacesToTripBtn";

const BACKGROUND_IMAGES = [
"/Home-bg/Home-bg-1.jpg",
"/Home-bg/Home-bg-2.jpg",
"/Home-bg/Home-bg-3.jpg",
"/Home-bg/Home-bg-4.jpg",
"/Home-bg/Home-bg-5.jpg",
"/Home-bg/Home-bg-6.jpg",
"/Home-bg/Home-bg-7.jpg",
"/Home-bg/Home-bg-8.jpg",
"/Home-bg/Home-bg-9.jpg",
"/Home-bg/Home-bg-10.jpg",
"/Home-bg/Home-bg-11.jpg",
];

import toast from "react-hot-toast";
import ExploreTripCard from "./components/home/ExploreTripCard";

export default function Home(){
  const router = useRouter();
  const [bgIndex, setBgIndex] = useState(0);
  const [destinationInput, setDestinationInput] = useState<string>(""); // 給 input 用

  const { activeTripId } = useTripDraft();


  // ==========================================
  // 控制 Modal 與背景搜尋狀態的 State
  // ==========================================
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchLoc, setSearchLoc] = useState("");  // 紀錄要搜尋的地點

  // 輪播邏輯：每 3 秒換下一張
  useEffect(() => {
    const timer = setInterval(() => {
      setBgIndex((prev) => (prev + 1) % BACKGROUND_IMAGES.length);
    },5000);
    return () => clearInterval(timer);
  }, []);

  // ==========================================
  // 抓取首頁下方「探索熱門行程」
  // ==========================================
  const exploreTripsQ = useQuery({
    queryKey: ["exploreTrips"],
    queryFn: async () => apiGet<any[]>("/api/explore/trips"),
  });


  // ==========================================
  // 搜尋按鈕邏輯
  // ==========================================
  const handleSearch = async (location: string) => {

    if (!location.trim()) return toast.error("請輸入地點");
    setSearchLoc(location);
    // 1. 沒有trip 彈出建立行程 Modal 讓使用者填寫 (不讓他等！)
    if (!activeTripId) {
      setIsModalOpen(true);
    } else {
      router.push(`/search?location=${location}`);
      // 因為非同步，直接使用上面傳入的 location 變數，不要用 searchLoc！
    }

  };

  // ==========================================
  // Modal 建立行程成功後的分流邏輯
  // ==========================================
  const handleModalSuccess = () => {
    setIsModalOpen(false); // 關閉 Modal

    // 行程建好後，無腦送去 search 頁面，把剩下的判斷交給 search 處理
    router.push(`/search?location=${searchLoc}`);
  };

  return (
    <main className="flex flex-col items-center w-full bg-[#f9f9ff]">
              
      {/* --- 全螢幕背景圖層 --- */}
      <div className="fixed inset-0 z-0 w-full h-full bg-[#f9f9ff]">
        {BACKGROUND_IMAGES.map((src, index) => (
          <div 
            key={src}
            className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-[1500ms] ease-in-out" // 1.5秒平滑淡入淡出
            style={{ 
              backgroundImage: `url('${src}')`,
              // 當前 index 則顯示透明度 1，其餘為 0
              opacity: index === bgIndex ? 0.8 : 0,
            }}
          />
        ))}
        
        {/* 弱化版的漸層疊加層 */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#f9f9ff]/60 via-transparent to-[#f9f9ff]/80" />
      </div>

      {/* --- 主要內容區塊：需設定 z-10 確保在背景上方 --- */}
      <div className="relative z-10 w-full flex flex-col items-center">
        
        {/* Hero 區塊：搜尋框 */}
        <section className="w-full max-w-5xl px-6 pt-24 pb-24 flex flex-col items-center">
          <div className="w-full max-w-3xl">
            <SearchPanel
              destination={destinationInput}
              onDestinationChange={setDestinationInput}
              onSearch={(city) => handleSearch(city || destinationInput)}
            />
          </div>
        </section>

        {/* 下半部：熱門行程推薦 */}
        <section className="w-full max-w-7xl px-8 pb-32">
            <div className="flex flex-col mb-12">
              <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
                熱門行程推薦
              </h2>
              <div className="h-1 w-24 bg-slate-900 mt-4 rounded-full" /> {/* 用小底線取代長側邊線 */}
            </div>
            
            
            {exploreTripsQ.isLoading ? (
              <p className="text-gray-500">載入熱門行程中...</p>
            ) : exploreTripsQ.isError ? (
              <p className="text-red-500">無法載入熱門行程</p>
            ) : exploreTripsQ.data?.length === 0 ? (
              <p className="text-gray-500">目前還沒有公開的行程喔！</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
                {exploreTripsQ.data?.map((trip) => (
                  <ExploreTripCard key={trip.trip_id} trip={trip} />
                ))}
              </div>
            )}
          
        </section>

      </div>

      {/* 獨立出來的 CreateTripModal */}
      <CreateTripModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
      />

      {activeTripId && (
        <AddPlacesToTripBtn />
      )};
        
    </main>
  );
}