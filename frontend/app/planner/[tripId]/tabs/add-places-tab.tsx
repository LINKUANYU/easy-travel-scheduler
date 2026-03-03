"use client";

import { useRef, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import PlaceAutocompleteInput from "@/components/planner/PlaceAutocompleteInput";
import TripMap from "@/components/planner/TripMap";
import { fetchPlacePreview, type PlacePreview } from "@/lib/placePreview";

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
  // 無論後端丟過來的是「純陣列」還是「包在物件裡的陣列」，出去的一定要是 TripPlace 格式的陣列。
  
  if (Array.isArray(payload)) return payload as TripPlace[];
  if (payload && Array.isArray(payload.data)) return payload.data as TripPlace[];
  return [];
}

export default function AddPlacesTab({ tripId }: { tripId: number }) {
  // qc 是 React Query 的全域管理實體，當你成功加入一個新景點後，你會用這個 qc 來下達指令：「嘿！那個標籤為 ["tripPlaces", tripId] 的資料已經舊了，去重抓一遍！」這就是所謂的 Invalidation
  const qc = useQueryClient();
  const [uiMsg, setUiMsg] = useState<string>("");
  
  // ✅ 新增：preview 狀態
  const [preview, setPreview] = useState<PlacePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState<string>("");

  // ✅ 用 token 避免連點造成 race
  const pickTokenRef = useRef(0);

  // 資料抓取，只要tripId 改變就執行，並確保回傳陣列
  const placesQ = useQuery({
    queryKey: ["tripPlaces", tripId],
    queryFn: async () => {
      const payload = await apiGet<any>(`http://localhost:8000/api/trips/${tripId}/places`);
      return normalizePlacesPayload(payload);
    },
  });

  // useQuery 是用來「讀取」，而 useMutation 則是用來「修改」資料
  const addM = useMutation({
    mutationFn: async (google_place_id: string) => {
      // 依你的後端設計：這裡假設 body 叫 google_place_id
      return apiPost<any>(`http://localhost:8000/api/trips/${tripId}/places`, { google_place_id });
    },
    onSuccess: async () => {
      setUiMsg("已加入！");
      await qc.invalidateQueries({ queryKey: ["tripPlaces", tripId] });
      // 小提示訊息 1.5 秒後消失
      window.setTimeout(() => setUiMsg(""), 1500);
    },
  });

  const removeM = useMutation({
    mutationFn: async (destination_id: number) => {
      return apiDelete<any>(`http://localhost:8000/api/trips/${tripId}/places/${destination_id}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tripPlaces", tripId] });
    },
    onError: (e: any) => {
      setUiMsg(`加入失敗：${e?.message || "unknown error"}`);
    },
  });

  const places = useMemo(() => placesQ.data ?? [], [placesQ.data]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "420px 1fr",
        gap: 12,
        alignItems: "start",
      }}
    >
      {/* ✅ 左欄：只留下景點池 */}
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

      {/* ✅ 右欄：地圖（輸入框放地圖左上角） */}
      <div>
        <TripMap
          places={places}
          preview={preview}
          isAddingPreview={addM.isPending}
          onAddPreview={(placeId) => {
            // 檢查景點池內是否已經有了
            const exists = places.some((p) => p.google_place_id === placeId);
            if (exists) return;
            addM.mutate(placeId);
          }}
          onClearPreview={() => setPreview(null)}
          topLeft={
            <div style={{ display: "grid", gap: 8 }}>
              <PlaceAutocompleteInput
                disabled={previewLoading}
                placeholder="搜尋並選擇地點（Google Places）"
                onPick={async ({ placeId, label }) => {  //接收子層丟出來的 { placeId, label }
                  setPreviewErr("");
                  setPreviewLoading(true);
                  setPreview(null);
                  // 每次你點選地點，pickTokenRef 就會加 1。假設現在是第 5 次搜尋，當前的 token 就是 5。
                  const token = ++pickTokenRef.current;
                  try {
                    // 拿著這個 ID 去問 Google 詳細座標，會花時間
                    const data = await fetchPlacePreview(placeId);
                    if (token !== pickTokenRef.current) return;  // 資料回來時使用者如果已經又選下個地點就return
                    // 可選：把 label 覆蓋進 name（若 API 沒回 displayName）
                    setPreview({ ...data, name: data.name ?? label });
                  } catch (e: any) {
                    if (token !== pickTokenRef.current) return;
                    setPreviewErr(e?.message || String(e));
                  } finally {
                    if (token === pickTokenRef.current) setPreviewLoading(false);
                  }
                }}
              />

              {(previewLoading || previewErr) && (
                <div style={{ fontSize: 13, opacity: 0.8 }}>
                  {previewLoading ? "載入預覽中…" : `預覽失敗：${previewErr}`}
                </div>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}