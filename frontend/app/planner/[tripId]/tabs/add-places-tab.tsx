"use client";

import { useRef, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import PlaceAutocompleteInput from "@/components/planner/PlaceAutocompleteInput";
import TripMap from "@/components/planner/TripMap";
import { fetchPlacePreview, type PlacePreview } from "@/lib/placePreview";
import type { TripPlace, ItineraryItem, ItinerarySummaryRow } from "@/types/attraction";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, pointerWithin } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";


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

  // [將當日排程內的景點重新排序]
  const reorderM = useMutation({
    mutationFn: async (ordered_item_ids: number[]) => {
      return apiPut<{ ok: boolean }>(
        `http://localhost:8000/api/trips/${tripId}/days/${activeDay}/itinerary/reorder`,
        { ordered_item_ids }
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["dayItinerary", tripId, activeDay] }); // 你可以不 invalidate（因為我們已經本地更新了），但保守起見先保留
      await qc.invalidateQueries({ queryKey: ["itinerarySummary", tripId] });
    },
    onError: (e: any) => {
      setUiMsg(`排序更新失敗：${e?.message || "unknown error"}`);
      window.setTimeout(() => setUiMsg(""), 1500);
      // 失敗時建議回復伺服器版本
      qc.invalidateQueries({ queryKey: ["dayItinerary", tripId, activeDay] });
      qc.invalidateQueries({ queryKey: ["itinerarySummary", tripId] });
    },
  });
  
  // ---------------------------------------------------------
  // 5. 輔助函式
  // ---------------------------------------------------------
  function prevDay(){
    setActiveDay((d) => Math.max(1, d - 1));
  }
  function nextDay(){
    setActiveDay((d) => Math.min(days, d + 1));
  }

  const updatePreview = async (placeId: string, displayName?: string) => {
    if (!placeId) return;

    setPreviewErr("");
    setPreviewLoading(true);
    setPreview(null);

    const token = ++pickTokenRef.current;
    try{
      const data = await fetchPlacePreview(placeId);
      if (token !== pickTokenRef.current) return;
      setPreview({...data, name: data.name ?? displayName})
    } catch (e: any) {
      if (token !== pickTokenRef.current) return;
      setPreviewErr(e?.message || String(e));
    } finally {
      if (token === pickTokenRef.current) setPreviewLoading(false);
    }
  };

  // ---------------------------------------------------------
  // 6. 拖拉套件
  // ---------------------------------------------------------

  // SortableRow：UI 的執行工人，像是一個「透明的防護罩」，把你的景點資料（例如台北 101）包起來。
  function SortableRow({ id, children }: {
    id: number;
    children: (args: { dragAttributes: any; dragListeners: any; style: React.CSSProperties }) => React.ReactNode;
  }) {
    // useSortable：賦予元件「排序靈魂」它幫你算好了所有拖拉需要的參數
    // setNodeRef: 告訴 dnd-kit：「嘿，這塊 DOM 元素（那個 <div>）就是我們要移動的東西。」
    // transform & transition: 這是最魔法的地方。當你拖動別的項目蓋過它時，它會算出位移量（transform），讓這行自動「閃開」騰出空間，並帶有平滑的動畫（transition）。
    // isDragging: 一個布林值，讓你知道「現在是不是正在抓著我」。
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

    // 處理視覺畫面
    const style: React.CSSProperties = {
      transform: CSS.Transform.toString(transform),  // 將座標物件轉成 CSS 字串，如 translate3d(0, 50px, 0)
      transition,  // 讓移動過程有流暢的動畫
      opacity: isDragging ? 0.6 : 1,  // 拖拽時讓本體變半透明，視覺效果更好
    };

    return (
      <div ref={setNodeRef} style={style}>
        {children({ dragAttributes: attributes, dragListeners: listeners, style })}
        {/* 這不是普通的 children（像 <div>內容</div>），而是一個函數。
        因為有時候我們不希望「整個整列」一點擊就拖走，我們可能只想讓左邊的「六個點圖示 (Drag Handle)」負責觸發拖拉。 */}
      </div>
    );
  }

  // PointerSensor (感應器類型) 這是最通用的感應器，它同時支援滑鼠 (Mouse) 和 觸控螢幕 (Touch)。
  // distance: 當位移 > 6 像素：系統才會確認：「開始動作」這時才會把元件抓起來變透明，進入拖拉狀態。
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // onDragEnd 的角色（決策者）：
  // 這是整段拖拉流程的 「終點站」。當工人（SortableRow）完成搬運後，大腦（onDragEnd）要負責拍板定案：
  function onDragEnd(event: any) {
    const { active, over } = event;
    // active: 你現在正抓著、準備移動的那個物件。over: 你放開滑鼠時，底下壓著的那個目標物件。
    if (!over || active.id === over.id) return;
    // 如果你放開的地方沒有東西（!over），或者你抓起來又放回原位（id 相同），就直接結束，

    const ids = dayItems.map((x) => x.item_id);  // 取出所有item_id
    const oldIndex = ids.indexOf(active.id);  // 抓著的Item 原本位置的排序
    const newIndex = ids.indexOf(over.id);  // 抓著的Item 新位置的排序
    if (oldIndex < 0 || newIndex < 0) return;

    // arrayMove: 這是 dnd-kit 提供的工具。原本是 [A, B, C]，把 A 移到 C ，它會幫你算出新的陣列：[B, C, A]。
    const newItems = arrayMove(dayItems, oldIndex, newIndex);  // 原本物件dayItem 裡的東西都還在，只是順序變了

    // 1) 立即更新 UI（更新 react-query cache）
    qc.setQueryData(["dayItinerary", tripId, activeDay], newItems);
    // setQueryData (key, data) 是讓你「強行寫入」**資料到快取（Cache）裡。

    // 2) call 後端 bulk reorder api
    reorderM.mutate(newItems.map((x) => x.item_id));  // 送後端用 item_id 組成的新排序陣列
  }
  /**
  整體架構中的運作流程圖
  使用者動作：滑鼠點擊 ⠿ 並移動超過 6px（sensors 認可動作）。
  視覺回饋：SortableRow 接收到 useSortable 的指令，讓元件變透明並跟著滑鼠跑。
  動作結束：使用者放開滑鼠，觸發 onDragEnd。
  資料更新（雙軌制）：
    快速軌道 (Frontend)：onDragEnd 直接把結果塞進 React Query Cache，畫面瞬間排好。
    慢速軌道 (Backend)：onDragEnd 同時把 ID 陣列送往 FastAPI，完成資料庫持久化。
   */



  return (
    <div style={{ 
      display: "grid",
      gap: 12,
      height: "calc(100vh - 110px)", // 設定為視窗高度，需扣除上下空間
      boxSizing: "border-box",
      overflow: "hidden" // 防止最外層出現捲軸
    }}>
      {uiMsg && <div style={{ fontSize: 13, opacity: 0.85 }}>{uiMsg}</div>}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 2fr", // ✅ 25/25/50
          gap: 12,
          alignItems: "stretch",
          height: "100%", // ✅ 撐滿父容器
          minHeight: 0    // ✅ 重要：防止內容撐開 Grid
        }}
      >
        {/* =========================
            左 25%：每日行程
           ========================= */}
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "white" }}>
          <div style={{ flexShrink: 0 }}> {/* 固定高度，不被壓縮 */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <button onClick={prevDay} disabled={activeDay === 1} style={{cursor: "pointer"}}>
                ◀
              </button>
              <div style={{ fontWeight: 800 }}>Day {activeDay}</div>
              <button onClick={nextDay} disabled={activeDay === days} style={{cursor: "pointer"}}>
                ▶
              </button>
            </div>
          </div>
          {/* 滾動內容區 */}
          <div style={{ marginTop: 10, overflowY: "auto", flexGrow: 1, paddingRight:4 }}>
            {dayItinQ.isLoading ? (
              <p>Loading itinerary…</p>
            ) : dayItinQ.isError ? (
              <p>Load itinerary failed: {(dayItinQ.error as Error).message}</p>
            ) : dayItems.length === 0 ? (
              <p style={{ opacity: 0.7 }}>今天還沒加入行程</p>
            ) : (
              // DndContext 它是最外層的容器，是環境提供者的角色，任務：感測器 (Sensors)、碰撞偵測 (Collision)、事件調度 (onDragEnd)
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                {/* SortableContext 劃定了「這區的東西可以互相排隊」的範圍。items: 必須傳入一個單純的 ID 陣列。「在這個範圍內，這些 ID 才是我們要追蹤的目標」。 */}
                <SortableContext items={dayItems.map((it) => it.item_id)} strategy={verticalListSortingStrategy}>
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {dayItems.map((it, idx) => (
                      // SortableRow 這就是你自己寫的那個封裝了 useSortable 的工人。角色：物理執行者。任務：座標計算 (Transform)、DOM 連接 (setNodeRef)、權限移交 (Render Props)
                      <SortableRow key={it.item_id} id={it.item_id}>
                        {/* 這邊把屬性、監聽器「權限」傳出來 */}
                        {({ dragAttributes, dragListeners }) => (
                          <div
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
                            <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
                              {/* 拖拉把手（建議只用把手拖） */}
                              <span
                                {...dragAttributes}
                                {...dragListeners}
                                style={{
                                  cursor: "grab",
                                  padding: "4px 6px",
                                  border: "1px solid #ddd",
                                  borderRadius: 8,
                                  userSelect: "none",
                                }}
                                title="拖拉排序"
                              >
                                ⠿
                              </span>

                              <div 
                                style={{ minWidth: 0, cursor: "pointer"}} 
                                onClick={() => updatePreview(it.google_place_id, it.place_name)}
                              >
                                <div
                                  style={{
                                    fontWeight: 700,
                                    whiteSpace: "nowrap",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                  }}
                                >
                                  {/* 用 idx 顯示序號，不管怎麼拉排序都不變 */}
                                  {idx + 1}. {it.place_name ?? `#${it.destination_id}`}
                                </div>
                              </div>
                            </div>

                            <button
                              onClick={() => removeItemM.mutate(it.item_id)}
                              disabled={removeItemM.isPending}
                              style={{ padding: "6px 10px", borderRadius: 10, border: "1px solid #ddd" }}
                              aria-label="remove itinerary"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </SortableRow>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

            )}
          </div>
        </div>

        {/* =========================
            中 25%：景點池（加入行程按鈕）
           ========================= */}
        <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "white" }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Trip 景點池</div>

          {placesQ.isLoading ? (
            <p>Loading places…</p>
          ) : placesQ.isError ? (
            <p>Load places failed: {(placesQ.error as Error).message}</p>
          ) : sortedPlaces.length === 0 ? (
            <p>尚未加入景點。</p>
          ) : (
            <div style={{ overflowY: "auto", flexGrow: 1, paddingRight: 4 }}>
              <ul style={{ padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
                {sortedPlaces.map((p) => {
                  const scheduled = scheduledMap.get(p.destination_id);  // 從上面做好的 scheduledMap 表中找是否已存在某一天的行程內
                  return (
                    <li
                      key={p.destination_id}
                      style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, cursor: "pointer" }}
                      onClick={() => updatePreview(p.google_place_id, p.place_name)}
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
            </div>
          )}
        </div>

        {/* =========================
            右 50%：地圖（你原本的）
           ========================= */}
        <div style={{ border: "1px solid #ddd", borderRadius: 12, overflow: "hidden", height: "100%" }}>
          <TripMap
            places={places}
            scheduleSummary={summaryQ.data ?? []}
            activeDay={activeDay}
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
                  onPick={({placeId, label}) => updatePreview(placeId, label)}
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