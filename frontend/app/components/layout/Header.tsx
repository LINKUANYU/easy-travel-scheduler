"use client";

import Link from "next/link";
import AuthCorner from "./AuthCorner";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/app/lib/api";


// 暫時用一個常數來模擬登入狀態，之後你可以替換成真正的 Auth Context 或 Session
const isLoggedIn = false; 

export default function Header() {

  const pathname = usePathname();
  
  // 透過正則表達式，擷取網址中的 tripId (例如 /planner/15 -> 拿到 "15")
  const tripIdMatch = pathname?.match(/\/planner\/(\d+)/);
  const tripId = tripIdMatch ? tripIdMatch[1] : null;

  // 只要 tripId 存在，就去 React Query 拿快取的資料
  // ⚠️ 這裡的 queryKey 和 queryFn 必須跟你 planner-client.tsx 裡面抓 Trip 資料的寫法一模一樣，才能完美共用快取！
  const { data: trip } = useQuery({
    queryKey: ["trip", tripId],
    queryFn: async () => await apiGet<any>(`/api/trips/${tripId}`),
    enabled: !!tripId, // 只有在進入 /planner/[tripId] 時才觸發
  });




  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50, // 確保它浮在所有內容（包含地圖）之上
        backgroundColor: "#ffffff",
        borderBottom: "1px solid #eaeaea",
        padding: "0 20px",
        height: "64px",
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr", // 關鍵排版：左右等寬，中間自適應
        alignItems: "center",
      }}
    >
      {/* 左側：如果進入了編輯頁面，就顯示行程名稱與天數 */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
        {trip && (
          <>
            <span style={{ fontWeight: 800, fontSize: "18px", color: "#111" }}>
              {trip.title}
            </span>
            <span style={{ fontSize: "13px", color: "#666", fontWeight: 500 }}>
              共 {trip.days} 天 {trip.start_date ? `· ${trip.start_date}` : ""}
            </span>
          </>
        )}
      </div>

      {/* 中間：Slogan 絕對置中 */}
      <div style={{ textAlign: "center", fontWeight: 800, fontSize: "20px" }}>
        <Link href="/" style={{ textDecoration: "none", color: "#333" }}>
          Easy-Travel-Scheduler
        </Link>
      </div>

      {/* 右側：按鈕區 (靠右對齊) */}
      <AuthCorner />
    </header>
  );
}

// 簡單的共用按鈕樣式
const btnStyle = {
  padding: "8px 16px",
  borderRadius: "8px",
  border: "none",
  backgroundColor: "#333",
  color: "#fff",
  fontWeight: "bold",
  cursor: "pointer",
};