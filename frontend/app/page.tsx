"use client"; // 告訴 Next.js 這是在瀏覽器執行的元件

import { useEffect, useState } from "react";


export default function Home() {
  const [destination, setDestination] = useState<string>("");
  const [responseMsg, setResponseMsg] = useState<string>("");

  const handlesearch = async () => {
    if (!destination) return alert('請輸入地點');

    try{
      const response = await fetch("http://127.0.0.1:8000/api/search", {
        method: "POST",
        headers:{"content-type": "application/json"},
        body: JSON.stringify({location: destination})
      });

      const data = await response.json();
      console.log(data.data);
      setResponseMsg(data.message);
    }catch(err){
      console.error("ERROR", err);
      setResponseMsg("BACKEND ERROR")
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">
          這次想去哪個城市旅遊呢？
        </h1>
        <div className="flex flex-col gap-4">
          <input 
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="東京、巴黎、上海、洛杉磯"
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"/>
          {destination && (
            <p className="text-center text-blue-600 font-medium">
              準備好出發去{destination}了嗎？
            </p>
          )}
          <button
            onClick={handlesearch}
            className="w-full bg-blue-600 text-white p-3 rounded-lg hover:bg-blue-700 transition">
            出發搜尋
          </button>
          {responseMsg && (
            <div className="mt-4 p-3 bg-green-50 text-green-700 rounded-lg text-center">
              {responseMsg}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
