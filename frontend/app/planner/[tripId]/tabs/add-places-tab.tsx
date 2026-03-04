"use client";

import { useRef, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import PlaceAutocompleteInput from "@/components/planner/PlaceAutocompleteInput";
import TripMap from "@/components/planner/TripMap";
import { fetchPlacePreview, type PlacePreview } from "@/lib/placePreview";
import type { TripPlace, ItineraryItem, ItinerarySummaryRow } from "@/types/attraction";


function normalizeArrayPayload<T>(payload: any): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && Array.isArray(payload.data)) return payload.data as T[];
  return [];
}

export default function AddPlacesTab({ tripId, days }: { tripId: number, days: number }) {
  // ---------------------------------------------------------
  // 1. 全域實體與基礎狀態 (Global Instances & Base State)
  // ---------------------------------------------------------
  const qc = useQueryClient();  // React Query 快取管理中心
  const [uiMsg, setUiMsg] = useState<string>("");  // UI 提示訊息 (如: 已加入、失敗等)
  
  // 排程天數狀態
  const [activeDay, setActiveDay] = useState(1);

  // 地圖預覽搜尋 preview 狀態
  const [preview, setPreview] = useState<PlacePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState<string>("");
  const pickTokenRef = useRef(0);  // 防止連點造成的 Race Condition (競爭狀態)

  // ---------------------------------------------------------
  // 2. 資料抓取 (Data Fetching - Query)
  // ---------------------------------------------------------

  // A. 景點池：獲取此行程所有「已儲存」但尚未必「已排程」的地點
  const placesQ = useQuery({
    queryKey: ["tripPlaces", tripId],
    queryFn: async () => {
      const payload = await apiGet<any>(`http://localhost:8000/api/trips/${tripId}/places`);
      return normalizeArrayPayload<TripPlace>(payload);
    },
  });
  // 輔助變數
  const places = useMemo(() => placesQ.data ?? [], [placesQ.data]);

  // B. 行程摘要：用來快速對照哪些景點「已經出現在哪一天」
  const summaryQ = useQuery({
    queryKey: ["itinerarySummary", tripId],
    queryFn: async () => {
      const payload = await apiGet<any>(`http://localhost:8000/api/trips/${tripId}/itinerary/summary`);
      return normalizeArrayPayload<ItinerarySummaryRow>(payload);
    },
  });

  // C. 當日明細：獲取特定某一天 (activeDay) 的具體景點排序資料
  const dayItinQ = useQuery({
    queryKey: ["dayItinerary", tripId, activeDay],
    queryFn: async () => {
      const payload = await apiGet<any>(
        `http://localhost:8000/api/trips/${tripId}/days/${activeDay}/itinerary`
      );
      return normalizeArrayPayload<ItineraryItem>(payload);
    },
  });
  // 輔助變數
  const dayItems = dayItinQ.data ?? [];

  // ---------------------------------------------------------
  // 3. 資料衍生與轉換 (Derived State - useMemo)
  // ---------------------------------------------------------

  // 建立查找 Map 給後續查找景點是否已加入Itinerary用，Map 資料結構等同於python dict
  const scheduledMap = useMemo(() => {
    const m = new Map<number, ItinerarySummaryRow>();
    // 將summary 中資料以 key, value 寫入
    for (const r of summaryQ.data ?? []) m.set(r.destination_id, r);
    return m;
  }, [summaryQ.data]);

  // 景點池的資料：複製一份from fetch 然後排序好
  const sortedPlaces = useMemo(() => {
    // 在 JavaScript 中，.sort() 會直接修改原始陣列。因為 places 是從 useQuery 拿到的狀態（State），我們不應該直接去改動它（這叫 Mutation，可能會導致 React 渲染出錯）。
    // slice() 會複製出一份一模一樣的新陣列，我們在分身上做排序，確保原始資料的純淨。
    const arr = places.slice();
    
    arr.sort((a, b) => {
      const as = scheduledMap.has(a.destination_id) ? 1 : 0;  // 未加入(0)在上，已加入(1)在下
      const bs = scheduledMap.has(b.destination_id) ? 1 : 0;
      if (as !== bs) return as - bs; // 如果結果是 負數：a 排在 b 前面。正數：a 排在 b 後面。
      return 0; // 維持不變
    });
    return arr;
  }, [places, scheduledMap]); // 「景點池更新」或「行程表異動（導致 Map 改變）」時，才會重新排序。

  
  // ---------------------------------------------------------
  // 4. 資料變動 (Data Mutations)
  // ---------------------------------------------------------

  // [新增景點到景點池]
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

  // [移除景點池裡的景點]
  const removeM = useMutation({
    mutationFn: async (destination_id: number) => {
      return apiDelete<any>(`http://localhost:8000/api/trips/${tripId}/places/${destination_id}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tripPlaces", tripId] });
      // Phase 1 先不強制，需補上如果已排入行程就 disable 移除按鈕
    },
    onError: (e: any) => {
      setUiMsg(`加入失敗：${e?.message || "unknown error"}`);
    },
  });

  // [將景點池裡的景點加入當日排程]
  const addToDayM = useMutation({
    mutationFn: async (destination_id: number) => {
      return apiPost<any>(
        `http://localhost:8000/api/trips/${tripId}/days/${activeDay}/itinerary`,
        { destination_id }
      );
    },
    onSuccess: async () => {
      await Promise.all([
        // 資料同步更新：新增景點到指定當天的api已經成功了，去更新重新 fetch itinerarySummary、dayItinerary
        qc.invalidateQueries({ queryKey: ["itinerarySummary", tripId] }),
        qc.invalidateQueries({ queryKey: ["dayItinerary", tripId, activeDay] }),
      ]);
    },
    onError: (e: any) => {
      // 409: already scheduled
      setUiMsg(`加入行程失敗：${e?.message || "unknown error"}`);
      window.setTimeout(() => setUiMsg(""), 1500);
    },
  });

  // [將當日排程內的景點移除]
  const removeItemM = useMutation({
    mutationFn: async (item_id: number) => {
      return apiDelete<any>(`http://localhost:8000/api/trips/${tripId}/itinerary/${item_id}`);
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["itinerarySummary", tripId] }),
        qc.invalidateQueries({ queryKey: ["dayItinerary", tripId, activeDay] }),
      ]);
    },
    onError: (e: any) => {
      setUiMsg(`移除行程失敗：${e?.message || "unknown error"}`);
      window.setTimeout(() => setUiMsg(""), 1500);
    },
  });
  
  // Day 切換函數
  function prevDay(){
    setActiveDay((d) => Math.max(1, d - 1));
  }
  function nextDay(){
    setActiveDay((d) => Math.min(days, d + 1));
  }


  return (
    <div style={{ display: "grid", gap: 12 }}>
      {uiMsg && <div style={{ fontSize: 13, opacity: 0.85 }}>{uiMsg}</div>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 2fr", // ✅ 25/25/50
          gap: 12,
          alignItems: "start",
        }}
      >
        {/* =========================
            左 25%：每日行程
           ========================= */}
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={prevDay} disabled={activeDay === 1} style={{cursor: "pointer"}}>
              ◀
            </button>
            <div style={{ fontWeight: 800 }}>Day {activeDay}</div>
            <button onClick={nextDay} disabled={activeDay === days} style={{cursor: "pointer"}}>
              ▶
            </button>
          </div>

          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {dayItinQ.isLoading ? (
              <p>Loading itinerary…</p>
            ) : dayItinQ.isError ? (
              <p>Load itinerary failed: {(dayItinQ.error as Error).message}</p>
            ) : dayItems.length === 0 ? (
              <p style={{ opacity: 0.7 }}>今天還沒加入行程</p>
            ) : (
              // 對當日每個行程做設計
              dayItems.map((it) => (
                <div
                  key={it.item_id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 10,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {it.position + 1}. {it.place_name ?? `#${it.destination_id}`}
                    </div>
                  </div>

                  <button
                    onClick={() => removeItemM.mutate(it.item_id)}
                    disabled={removeItemM.isPending}
                    style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", cursor: "pointer" }}
                    aria-label="remove itinerary"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* =========================
            中 25%：景點池（加入行程按鈕）
           ========================= */}
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Trip 景點池</div>

          {placesQ.isLoading ? (
            <p>Loading places…</p>
          ) : placesQ.isError ? (
            <p>Load places failed: {(placesQ.error as Error).message}</p>
          ) : sortedPlaces.length === 0 ? (
            <p>尚未加入景點。</p>
          ) : (
            <ul style={{ padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
              {sortedPlaces.map((p) => {
                const scheduled = scheduledMap.get(p.destination_id);  // 從上面做好的 scheduledMap 表中找是否已存在某一天的行程內
                return (
                  <li
                    key={p.destination_id}
                    style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}
                  >
                    <div style={{ fontWeight: 800 }}>{p.place_name ?? `#${p.destination_id}`}</div>
                    <div style={{ fontSize: 13, opacity: 0.75 }}>
                      {p.city_name ? `${p.city_name} · ` : ""}
                      {p.google_place_id ?? ""}
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                      {/* 加入行程 / 已加入 */}
                      {scheduled ? (
                        <button
                          disabled
                          style={{
                            padding: "6px 10px",
                            borderRadius: 10,
                            border: "1px solid #ddd",
                            opacity: 0.6,
                          }}
                          title={`已加入 Day ${scheduled.day_index}`}
                        >
                          已加入
                        </button>

                      ) : (
                        <button
                          onClick={() => addToDayM.mutate(p.destination_id)}
                          disabled={addToDayM.isPending}
                          style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", cursor: "pointer" }}
                        >
                          {addToDayM.isPending ? "Adding…" : "加入行程"}
                        </button>
                      )}

                      {/* 你原本的「移除景點池」按鈕（可保留）
                         Phase 1 建議：若 scheduled 就 disable，避免刪掉後 itinerary 變孤兒/不一致
                      */}
                      <button
                        onClick={() => removeM.mutate(p.destination_id)}
                        disabled={removeM.isPending || !!scheduled}
                        style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd", cursor: scheduled ? "not-allowed" : "pointer"}}
                        title={scheduled ? "此景點已加入行程，請先從行程移除" : ""}
                      >
                        
                        {removeM.isPending ? "Removing…" : "移除"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* =========================
            右 50%：地圖（你原本的）
           ========================= */}
        <div style={{ border: "1px solid #ddd", borderRadius: 12, overflow: "hidden" }}>
          <TripMap
            places={places}
            preview={preview}
            isAddingPreview={addM.isPending}
            onAddPreview={(placeId) => {
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
                  onPick={async ({ placeId, label }) => {
                    setPreviewErr("");
                    setPreviewLoading(true);
                    setPreview(null);

                    const token = ++pickTokenRef.current;
                    try {
                      const data = await fetchPlacePreview(placeId);
                      if (token !== pickTokenRef.current) return;
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
    </div>
  );
}