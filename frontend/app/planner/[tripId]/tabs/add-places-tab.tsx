"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "@/lib/api";

type TripPlace = {
  destination_id: number;
  place_name?: string;
  city_name?: string;
  google_place_id?: string;
  lat?: number | null;
  lng?: number | null;
  // 你後端如果有 photos/cover 也可加上來
};

function normalizePlacesPayload(payload: any): TripPlace[] {
  // 你可以讓後端回 list 或 {data:list}，這裡兩種都吃
  if (Array.isArray(payload)) return payload as TripPlace[];
  if (payload && Array.isArray(payload.data)) return payload.data as TripPlace[];
  return [];
}

export default function AddPlacesTab({ tripId }: { tripId: number }) {
  const qc = useQueryClient();
  const [gpid, setGpid] = useState("");

  const placesQ = useQuery({
    queryKey: ["tripPlaces", tripId],
    queryFn: async () => {
      const payload = await apiGet<any>(`http://localhost:8000/api/trips/${tripId}/places`);
      return normalizePlacesPayload(payload);
    },
  });

  const addM = useMutation({
    mutationFn: async (google_place_id: string) => {
      // 依你的後端設計：這裡假設 body 叫 google_place_id
      return apiPost<any>(`http://localhost:8000/api/trips/${tripId}/places`, { google_place_id });
    },
    onSuccess: async () => {
      setGpid("");
      await qc.invalidateQueries({ queryKey: ["tripPlaces", tripId] });
    },
  });

  const removeM = useMutation({
    mutationFn: async (destination_id: number) => {
      return apiDelete<any>(`http://localhost:8000/api/trips/${tripId}/places/${destination_id}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tripPlaces", tripId] });
    },
  });

  const places = useMemo(() => placesQ.data ?? [], [placesQ.data]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* 先用最小可用：手動貼 google_place_id，確保端到端打通 */}
      <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>手動加入（先打通流程）</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={gpid}
            onChange={(e) => setGpid(e.target.value)}
            placeholder="貼上 google_place_id（place_id）"
            style={{ flex: 1, padding: "8px 10px", borderRadius: 10, border: "1px solid #ccc" }}
          />
          <button
            onClick={() => addM.mutate(gpid.trim())}
            disabled={!gpid.trim() || addM.isPending}
            style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd" }}
          >
            {addM.isPending ? "Adding…" : "加入"}
          </button>
        </div>

        {/* 下一步：把這塊換成 Google Places Autocomplete UI */}
        <p style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>
          下一步我們會把這裡改成 Place Autocomplete，選到點後自動拿 place_id 丟到同一支 POST API。
        </p>

        {addM.isError && (
          <p style={{ marginTop: 8, color: "crimson" }}>
            Add failed: {(addM.error as Error).message}
          </p>
        )}
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <div style={{ fontWeight: 800 }}>Trip 景點池</div>

        {placesQ.isLoading ? (
          <p>Loading places…</p>
        ) : placesQ.isError ? (
          <p>Load places failed: {(placesQ.error as Error).message}</p>
        ) : places.length === 0 ? (
          <p>尚未加入景點。</p>
        ) : (
          <ul style={{ padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
            {places.map((p) => (
              <li
                key={p.destination_id}
                style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}
              >
                <div style={{ fontWeight: 800 }}>{p.place_name ?? `#${p.destination_id}`}</div>
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                  {p.city_name ? `${p.city_name} · ` : ""}
                  {p.google_place_id ?? ""}
                </div>

                <div style={{ marginTop: 8 }}>
                  <button
                    onClick={() => removeM.mutate(p.destination_id)}
                    disabled={removeM.isPending}
                    style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd" }}
                  >
                    {removeM.isPending ? "Removing…" : "移除"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}