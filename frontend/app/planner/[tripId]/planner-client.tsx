"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import AddPlacesTab from "./tabs/add-places-tab";

type Trip = {
  id?: number;
  trip_id?: number;
  title: string;
  days: number;
  start_date?: string | null;
};

// 輔助函式：確保從 URL 拿到的字串 tripId 能安全轉成數字，失敗則回傳 null
function normalizeTripId(x: string) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export default function PlannerClient({ tripId }: { tripId: string }) {
  // 使用 useMemo 快取轉換後的 ID，只有當 tripId 改變時才重新計算
  const tid = useMemo(() => normalizeTripId(tripId), [tripId]);
  
  // 控制當前分頁狀態，預設為 "add" (加入景點)
  const [tab, setTab] = useState<"add" | "schedule">("add");
  
  // 使用 React Query 抓取行程資料
  const tripQ = useQuery({
    queryKey: ["trip", tid],  // "trip"：分類標籤：告訴 React Query 這是一筆關於「行程 (Trip)」的資料，tid：唯一識別碼：每當 tid 改變，React Query 就會發現 Key 變了，自動觸發 queryFn 去抓新資料。
    enabled: tid !== null,  // 安全鎖：只有當 tid 有效時才發送請求
    queryFn: async () => {
      // 依你的後端實際回傳 shape 調整：這裡假設直接回 Trip
      return apiGet<Trip>(`http://localhost:8000/api/trips/${tid}`);
    },
  });

  if (tid === null) return <p>tripId 不合法</p>;  // 網址 ID 格式錯誤 (例如 /planner/abc)
  if (tripQ.isLoading) return <p>Loading trip…</p>;  // API 還在跑
  if (tripQ.isError) return <p>Load trip failed: {(tripQ.error as Error).message}</p>;  // API 報錯

  const trip = tripQ.data!;

  return (
    <>
      <header style={{ display: "grid", gap: 6 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>{trip.title}</h1>
        <div style={{ fontSize: 13, opacity: 0.75 }}>
          days: {trip.days} {trip.start_date ? `· start: ${trip.start_date}` : ""}
        </div>
      </header>

      <nav style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button
          onClick={() => setTab("add")}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            fontWeight: tab === "add" ? 800 : 500,
          }}
        >
          Add places
        </button>
        <button
          onClick={() => setTab("schedule")}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            fontWeight: tab === "schedule" ? 800 : 500,
          }}
        >
          Schedule（下一階段）
        </button>
      </nav>

      <section style={{ marginTop: 14 }}>
        {tab === "add" ? <AddPlacesTab tripId={tid} /> : <p>Schedule Tab：下一階段做</p>}
      </section>
    </>
  );
}