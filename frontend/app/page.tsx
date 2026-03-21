"use client"; // 告訴 Next.js 這是在瀏覽器執行的元件

import { useState} from "react";
import { useQuery } from "@tanstack/react-query";
import SearchPanel from "@/app/components/home/SearchPanel";
import { apiGet } from "@/app/lib/api";
import { useRouter } from "next/navigation";
import CreateTripModal from "./components/home/CreateTripModal";
import { useTripDraft } from "./hooks/useTripDraft";


import toast from "react-hot-toast";
import ExploreTripCard from "./components/home/ExploreTripCard";

export default function Home(){
  const router = useRouter();

  const [destinationInput, setDestinationInput] = useState<string>(""); // 給 input 用

  const { draft, clear, activeTripId, clearActiveTrip } = useTripDraft();

  // ==========================================
  // 控制 Modal 與背景搜尋狀態的 State
  // ==========================================
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchLoc, setSearchLoc] = useState("");

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
  const handleModalSuccess = (tripId: number) => {
    setIsModalOpen(false); // 關閉 Modal

    // 行程建好後，無腦送去 search 頁面，把剩下的判斷交給 search 處理
    router.push(`/search?location=${searchLoc}`);
  };

  return (
    <main className="relative flex flex-1 w-full flex-col items-center justify-start pt-8 pb-2 bg-gray-50">      
      <div className="w-full max-w-5xl px-4 flex flex-col items-center">
        
        {/* 上半部：搜尋框 */}
        <div className="w-full max-w-2xl mb-16">
          <SearchPanel
            destination={destinationInput}
            onDestinationChange={setDestinationInput}
            onSearch={() => handleSearch(destinationInput)}
          />
        </div>

        {/* 下半部：熱門行程推薦 */}
        <div className="w-full">
          <div className="flex items-center mb-6">
            <h2 className="text-2xl font-black text-gray-800 border-l-4 border-blue-500 pl-3">
              熱門行程推薦
            </h2>
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
        </div>

        {/* 🌟 掛載獨立出來的 CreateTripModal */}
        <CreateTripModal 
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSuccess={handleModalSuccess}
        />
        
      </div>
    </main>
  );
}