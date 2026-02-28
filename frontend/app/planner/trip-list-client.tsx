"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readTripIndex, TripIndexItem } from "@/lib/tripIndex";

export default function TripListClient() {
  const [items, setItems] = useState<TripIndexItem[]>([]);

  useEffect(() => {
    setItems(readTripIndex());
  }, []);

  if (items.length === 0) {
    return <p style={{ marginTop: 12 }}>尚未建立 Trip。請先回首頁建立。</p>;
  }

  return (
    <ul style={{ marginTop: 12, display: "grid", gap: 10, padding: 0, listStyle: "none" }}>
      {items.map((t) => (
        <li key={t.trip_id} style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
          <div style={{ fontWeight: 700 }}>{t.title}</div>
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            days: {t.days}
            {t.start_date ? ` · start: ${t.start_date}` : ""}
          </div>
          <div style={{ marginTop: 8 }}>
            <Link href={`/planner/${t.trip_id}`}>繼續規劃 →</Link>
          </div>
        </li>
      ))}
    </ul>
  );
}