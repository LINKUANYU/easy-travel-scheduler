"use client"; // 告訴 Next.js 這是在瀏覽器執行的元件

import { useState } from "react";
import type { Attraction } from "@/types/attraction";
import SearchPanel from "@/components/SearchPanel";
import ResultsSection from "@/components/ResultsSection";

type SearchResponse = {
  data?: Attraction[];
  message?: string;
};

export default function Home(){
  const [destination, setDestination] = useState<string>("");
  const [responseMsg, setResponseMsg] = useState<string>("");
  const [travelList, setTravelList] = useState<Attraction[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  const handlesearch = async () => {
    if (!destination.trim()) return alert("請輸入地點");

    setLoading(true);
    setResponseMsg("");

    try{
      const response = await fetch("http://127.0.0.1:8000/api/search", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({ location: destination})
      });

      const data: SearchResponse = await response.json();
      
      if (Array.isArray(data.data) && data.data.length > 0){
        setTravelList(data.data);
      }else{
        setTravelList([]);
        setResponseMsg(data.message ?? "沒有找到資料");
      }
    }catch(err){
      console.error("Error", err)
      setResponseMsg("伺服器發生錯誤，請稍後再試")
    }finally{
      setLoading(false);
    }

  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-100">
      {loading ? (
        <div className="bg-white p-8 rounded-lg shadow-md">
          <div className="flex flex-col items-center justify-center gap-3">
            <div className="h-10 w-10 rounded-full border-4 border-gray-300 border-t-blue-600 animate-spin" />
            <p className="text-lg font-semibold text-gray-800">正在搜尋地點中...</p>
          </div>
        </div>
      ) : travelList.length === 0 ? (
        <SearchPanel
          destination={destination}
          onDestinationChange={setDestination}
          onSearch={handlesearch}
          loading={loading}
          responseMsg={responseMsg}
        />
      ) : (
        <ResultsSection
          destination={destination}
          travelList={travelList}
          onReset={() => setTravelList([])}
        />
      )}
    </main>
  );

}






// import { useEffect, useState } from "react";
// import { motion } from "framer-motion"; // 引入 motion

// export default function Home() {
//   const [destination, setDestination] = useState<string>("");
//   const [responseMsg, setResponseMsg] = useState<string>("");
//   const [travelList, setTravelList] = useState<Attraction[]>([]); // 儲存卡片清單
//   const [loading, setLoading] = useState<boolean>(false);
  

//   const handlesearch = async () => {
//     if (!destination) return alert('請輸入地點');

//     setLoading(true);

//     try{
//       const response = await fetch("http://127.0.0.1:8000/api/search", {
//         method: "POST",
//         headers:{"content-type": "application/json"},
//         body: JSON.stringify({location: destination})
//       });

//       const data = await response.json();
//       if (data.data){
//         setTravelList(data.data);
//       }
//       console.log(data.data);
//     }catch(err){
//       console.error("ERROR", err);
//       setResponseMsg("BACKEND ERROR")
//     }finally{
//       setLoading(false);
//     }
//   };

//   return (
//     <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-100">
//       {/* 1. 條件渲染：只有當 travelList 沒有資料時，才顯示搜尋區塊 */}
//       {travelList.length ===0 && (
//         <div className="bg-white p-8 rounded-lg shadow-md">
//           <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">
//             這次想去哪個城市旅遊呢？
//           </h1>
//           <div className="flex flex-col gap-4">
//             <input 
//               type="text"
//               value={destination}
//               onChange={(e) => setDestination(e.target.value)}
//               placeholder="東京、巴黎、上海、洛杉磯"
//               className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"/>
//             {destination && (
//               <p className="text-center text-blue-600 font-medium">
//                 準備好出發去{destination}了嗎？
//               </p>
//             )}
//             <button
//               onClick={handlesearch}
//               className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition">
//               出發搜尋
//             </button>
//             {responseMsg && (
//               <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-lg text-center">
//                 {responseMsg}
//               </div>
//             )}
//           </div>
//         </div>
//       )}


//       {/* 3. 卡片展示區塊 - 使用 Grid 佈局 */}
//       {travelList.length !==0 && (
//         <>
//           <h1 className="text-2xl font-bold mb-6">最熱門{destination}的景點都在這裡，將喜愛的目的地加入您的旅行計畫</h1>
//           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-6xl">
//             {travelList.map((item, index) => (
//               <motion.div 
//                 key={item.id} 
//                 // 初始狀態：在下方 50px，且透明度為 0
//                 initial={{ opacity: 0, y: 50 }}
//                 // 動畫進入：回到原位，透明度為 1
//                 animate={{ opacity: 1, y: 0 }}
//                 // 設定動畫曲線與延遲（讓卡片一個接一個出現）
//                 transition={{ duration: 0.5, delay: index * 0.1 }}
//                 className="bg-white rounded-xl shadow-lg overflow-hidden hover:scale-105 transition-transform duration-300">
//                 {/* 這裡假設後端有給圖片 URL，如果沒有可以先用占位圖 */}
//                 <img 
//                   src={item.images?.[0]?.url ?? "https://via.placeholder.com/400x250"}
//                   alt={item.attraction}
//                   referrerPolicy="no-referrer"
//                   className="w-full h-48 object-cover"
//                 />
//                 <div className="p-5">
//                   <h3 className="text-xl font-bold text-gray-800 mb-2">{item.attraction}</h3>
//                   <p className="text-gray-600 text-sm leading-relaxed">
//                     {item.description}
//                   </p>
//                   <div className="flex items-center justify-between pt-4 mt-2">
//                     <div className="text-xs font-medium px-2 py-1 bg-blue-50 text-blue-600 rounded-full">
//                       📍 {item.geo_tags}
//                     </div>
//                     <button className="text-sm text-blue-600 font-bold hover:text-blue-800 transition-colors flex items-center gap-1">
//                       加入行程 <span className="text-lg">+</span>
//                     </button>
//                   </div>
//                 </div>
//               </motion.div>
//             ))}
//           </div>
//         </>
//       )}
      


//     </main>
//   );
// }
