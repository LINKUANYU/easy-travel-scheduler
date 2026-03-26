"use client";

import Link from "next/link";
import AuthCorner from "./AuthCorner";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/app/lib/api";

export default function Header() {
  const pathname = usePathname();
  
  // 1. 擷取 edit 頁面的 tripId
  const tripIdMatch = pathname?.match(/\/edit\/(\d+)/);
  const tripId = tripIdMatch ? tripIdMatch[1] : null;

  // 2. 擷取 share 頁面的 token
  const shareTokenMatch = pathname?.match(/\/share\/([^/]+)/);
  const shareToken = shareTokenMatch ? shareTokenMatch[1] : null;

  // 3. 獲取編輯模式的資料
  const { data: editTrip } = useQuery({
    queryKey: ["trip", tripId],
    queryFn: async () => await apiGet<any>(`/api/trips/${tripId}`),
    enabled: !!tripId, 
  });

  // 4. 獲取分享模式的資料 (這裡的 queryKey 必須跟 ShareWorkspace 一模一樣，就能共用快取)
  const { data: shareData } = useQuery({
    queryKey: ["shared-trip", shareToken],
    queryFn: async () => await apiGet<any>(`/api/share/${shareToken}`),
    enabled: !!shareToken,
  });

  // 5. 統一取出 trip 資訊（看當下在哪個頁面，就拿哪邊的資料）
  const trip = editTrip || shareData?.trip;

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100, // 提高 z-index 確保在輪播圖之上
        /* 1. 使用 rgba 設定 70% 透明度的白色背景 */
        backgroundColor: "rgba(255, 255, 255, 0.7)", 
        borderBottom: "1px solid rgba(234, 234, 234, 0.5)", // 邊框也調淡
        padding: "0 40px",
        height: "72px",
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr", 
        alignItems: "center",
      }}
    >
      {/* 左側：顯示行程名稱與天數 */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
        {/* {trip && (
          <>
            <span style={{ fontWeight: 800, fontSize: "18px", color: "#111" }}>
              {trip.title}
            </span>
            <span style={{ fontSize: "13px", color: "#666", fontWeight: 500 }}>
              共 {trip.days} 天 {trip.start_date ? `· ${trip.start_date}` : ""}
            </span>
          </>
        )} */}
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