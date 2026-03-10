"use client";

import { useRef, useMemo, useState, useEffect, Fragment } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import PlaceAutocompleteInput from "@/components/planner/PlaceAutocompleteInput";
import TripMap from "@/components/planner/TripMap";
import { fetchPlacePreview, type PlacePreview } from "@/lib/placePreview";
import type { TripPlace, ItineraryItem, ItinerarySummaryRow, TravelMode, LegRouteState, } from "@/types/all-types";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { fetchPlaceThumb, type PlaceThumb } from "@/lib/placeThumb";
import { makeLegKey, hasLatLng, formatDistance, formatDuration, computeLegRoute, type SimpleComputeRoutesRequest } from "@/lib/route-leg";



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
      const payload = await apiGet<any>(`/api/trips/${tripId}/places`);
      return normalizeArrayPayload<TripPlace>(payload);
    },
  });
  // 輔助變數－景點池內的資料
  const places = useMemo(() => placesQ.data ?? [], [placesQ.data]);

  // B. 行程摘要：用來快速對照哪些景點「已經出現在哪一天」
  const summaryQ = useQuery({
    queryKey: ["itinerarySummary", tripId],
    queryFn: async () => {
      const payload = await apiGet<any>(`/api/trips/${tripId}/itinerary/summary`);
      return normalizeArrayPayload<ItinerarySummaryRow>(payload);
    },
  });

  // C. 當日明細：獲取特定某一天 (activeDay) 的具體景點排序資料
  const dayItinQ = useQuery({
    queryKey: ["dayItinerary", tripId, activeDay],
    queryFn: async () => {
      const payload = await apiGet<any>(
        `/api/trips/${tripId}/days/${activeDay}/itinerary`
      );
      return normalizeArrayPayload<ItineraryItem>(payload);
    },
  });
  // 輔助變數－每日行程內的資料
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

  //「資料完整性」 與 「單一事實來源」，確定從「景點池」來的資料一定有lat、lng。因為「每日行程」內的景點需要座標資料，所以建立這個useMemo
  const placeByDestinationId = useMemo(() => {
    const m = new Map<number, TripPlace>();
    for (const p of places) {
      m.set(p.destination_id, p);
    }
    return m;
  }, [places]);

  /** 計算交通方式 */
  // 記錄「每一段目前選的是哪種交通方式」。 例如：{"101-205": "DRIVING", "205-307": "WALKING"}
  const [legModeMap, setLegModeMap] = useState<Record<string, TravelMode>>({});
  // 記錄「每一段實際算出來的結果」。例如：{"101-205": {mode: "DRIVING", fromItemId: 101, toItemId: 205, durationMillis: 8820000, distanceMeters: 123000}}
  const [legRouteMap, setLegRouteMap] = useState<Record<string, LegRouteState>>({});
  // 「建立點與點之間的路段」物件陣列
  const dayLegPairs = useMemo(() => {
    const pairs: Array<{
      key: string;
      from: ItineraryItem;
      to: ItineraryItem;
      mode: TravelMode;
    }> = [];

    for (let i = 0; i < dayItems.length - 1; i++) {
      const from = dayItems[i];
      const to = dayItems[i + 1];
      const key = makeLegKey(from.item_id, to.item_id);

      pairs.push({
        key,
        from,
        to,
        mode: legModeMap[key] ?? "DRIVING",
      });
    }

    return pairs;
  }, [dayItems, legModeMap]);

  
  // ---------------------------------------------------------
  // 4. 資料變動 (Data Mutations)
  // ---------------------------------------------------------

  // [新增景點到景點池]
  const addM = useMutation({
    mutationFn: async (google_place_id: string) => {
      // 依你的後端設計：這裡假設 body 叫 google_place_id
      return apiPost<any>(`/api/trips/${tripId}/places`, { google_place_id });
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
      return apiDelete<any>(`/api/trips/${tripId}/places/${destination_id}`);
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
        `/api/trips/${tripId}/days/${activeDay}/itinerary`,
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
      return apiDelete<any>(`/api/trips/${tripId}/itinerary/${item_id}`);
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
        `/api/trips/${tripId}/days/${activeDay}/itinerary/reorder`,
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

  
  // ---------------------------------------------------------
  // 7. 景點池、每日行程補縮圖
  // ---------------------------------------------------------

  // Record 定義成一個物件 {string: PlaceThumb} 組成
  const [ thumbMap, setThumbMap ] = useState<Record<string, PlaceThumb>>({});

  // 拿「每日景點」、「景點池」的google ids
  const neededPlaceIds = useMemo(() => {
    const ids = new Set<string>();
    
    for (const it of dayItems) {
      if (it.google_place_id) ids.add(it.google_place_id);
    }
    for (const p of sortedPlaces) {
      if (p.google_place_id) ids.add(p.google_place_id)};

    return Array.from(ids)
  }, [dayItems, sortedPlaces]);

  useEffect(() => {
    let cancelled = false;  

    // 從「目前畫面需要的所有 placeId」裡，只挑出「還沒存在 thumbMap 裡」的那些 id。
    const missingIds = neededPlaceIds.filter((id) => !thumbMap[id]);
    // 這裡的 id 不是固定文字，而是 filter() 每次跑時拿到的一個 place id，例如 "ChIJL..."。所以你不能寫：thumbMap.id
    
    if (missingIds.length === 0) return;

    async function loadThumb(){
      const results = await Promise.allSettled(
        missingIds.map((placeId) => fetchPlaceThumb(placeId)) // 對每個都去抓圖
      );
      
      if (cancelled) return; // 因為非同步，資料抓完先檢查元件有沒有被卸載，沒有才繼續渲染

      setThumbMap((prev) => { // 先傳入舊的state
        const next = { ...prev };

        // result 與 missingIds 的順序會對齊
        results.forEach((result, index) => {
          const placeId = missingIds[index];  // 把missingIds 陣列裡的id抓出來
          if (next[placeId]) return;  // 如果已經存在在舊的state就retrun

          next[placeId] =             // 如果不存在就新增一個{placeId: result.value 圖片結果}
            result.status === "fulfilled"  // 如果fetch 是成功的話
              ? result.value
              : ({} as PlaceThumb);  // fetch 失敗就放空的
        });
        
        return next;
      });
    }

    loadThumb();

    return () => {
      cancelled = true;  // cleanup 代表這一輪 effect 結束了，之後它的 async 結果就不要再碰 state 了。
    };

  }, [neededPlaceIds]);

  function getThumbUrl(placeId?: string | null) {
    if (!placeId) return undefined;

    const thumb = thumbMap[placeId];
    
    return thumb?.url
  }

  // ---------------------------------------------------------
  // 8. 計算交通方式
  // ---------------------------------------------------------
  // 建立一個持久化的參照物件，用來記錄「每一段路徑 (key)」目前的請求序號{key: 序號}。避免Race condition
  const legReqTokenRef = useRef<Record<string, number>>({});
  useEffect(() => {

    // 篩選需要更新的路段，存成物件陣列
    const pending = dayLegPairs.filter(({ key, from, to, mode }) => {
      const fromPlace = placeByDestinationId.get(from.destination_id);
      const toPlace = placeByDestinationId.get(to.destination_id);

      // 檢查座標，不完整資料就不要
      if (!hasLatLng(fromPlace) || !hasLatLng(toPlace)) return false; 
      // 舊資料中把[key]帶進去
      const cached = legRouteMap[key];
      if (!cached) return true;  // 如果不存在，就代表是新的資料，需要去計算路線
      if (cached.mode !== mode) return true;  // 如果交通模式不一樣就是true，交通方式改變需要計算路線
      if (cached.loading) return false;  // 如果已經在算了，就不要重新再計算

      // 同一 mode 已經有結果或有錯誤 -> 不要再算
      if (
        typeof cached.durationMillis === "number" ||
        typeof cached.distanceMeters === "number" ||
        cached.error
      ) {
        return false;
      }

      // 其他不完整狀態，保守起見再算一次
      return true;
      
    });

    if (pending.length === 0) return;

    async function loadLegs() {
      for (const req of pending) {
        // 拿 req.from.destination_id 的景點id去「景點池」資料<TripPlace>裡找 lat、 lng
        const fromPlace = placeByDestinationId.get(req.from.destination_id);
        const toPlace = placeByDestinationId.get(req.to.destination_id);

        // 座標有缺就跳過
        if (!hasLatLng(fromPlace) || !hasLatLng(toPlace)) continue;

        // 這一段 leg 的最新請求編號 +1
        const nextToken = (legReqTokenRef.current[req.key] ?? 0) + 1;  // (初始值不存在就設 0) +1
        legReqTokenRef.current[req.key] = nextToken; // {key: 編號}

        // 先把舊資料掛上讀取中，體驗會順暢很多。如果不先設 loading: true，使用者點擊切換交通工具後，畫面會卡在舊的數據幾秒鐘才跳掉，感覺像當機。
        setLegRouteMap((prev) => ({
          ...prev,
          [req.key]: {
            ...prev[req.key],  // 保留舊資料
            fromItemId: req.from.item_id,
            toItemId: req.to.item_id,
            mode: req.mode,
            loading: true,  // 告訴 UI：這段路正在算，請轉圈圈
            error: undefined,  // 把之前的錯誤洗掉
          },
        }));
        
        // Call 寫好的計算路徑API
        try {
          const result = await computeLegRoute({
            from: { lat: fromPlace.lat, lng: fromPlace.lng },
            to: { lat: toPlace.lat, lng: toPlace.lng },
            mode: req.mode,
          });

          // 如果這不是最新那筆 request 的回應，就丟掉
          if (legReqTokenRef.current[req.key] !== nextToken) continue;

          setLegRouteMap((prev) => ({
            ...prev,
            [req.key]: {
              fromItemId: req.from.item_id,
              toItemId: req.to.item_id,
              mode: req.mode,
              durationMillis: result.durationMillis,
              distanceMeters: result.distanceMeters,
              loading: false,
              error: undefined,
            },
          }));
        } catch (e: any) {
          // 如果這不是最新那筆 request 的回應，就丟掉
          if (legReqTokenRef.current[req.key] !== nextToken) continue;

          setLegRouteMap((prev) => ({
            ...prev,
            [req.key]: {
              fromItemId: req.from.item_id,
              toItemId: req.to.item_id,
              mode: req.mode,
              loading: false,
              error: e?.message || "route failed",
            },
          }));
        }
      }
    }

    loadLegs();

  }, [dayLegPairs, placeByDestinationId, legRouteMap]);


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
                    {dayItems.map((it, idx) => {
                      const thumbUrl = getThumbUrl(it.google_place_id);
                      const next = dayItems[idx + 1];

                      const legKey = next ? makeLegKey(it.item_id, next.item_id) : null;
                      const leg = legKey ? legRouteMap[legKey] : undefined;
                      const legMode = legKey ? legModeMap[legKey] ?? "DRIVING" : "DRIVING";

                      return (
                        <Fragment key={it.item_id}>
                          {/* SortableRow 這就是你自己寫的那個封裝了 useSortable 的工人。角色：物理執行者。任務：座標計算 (Transform)、DOM 連接 (setNodeRef)、權限移交 (Render Props) */}
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
                                  
                                  {thumbUrl ? (
                                    <img
                                      src={thumbUrl}
                                      alt={it.place_name ?? "place"}
                                      style={{
                                        width: 56,
                                        height: 56,
                                        objectFit: "cover",
                                        borderRadius: 10,
                                        flexShrink: 0,
                                        border: "1px solid #eee",
                                      }}
                                    />
                                  ) : (
                                    <div
                                      style={{
                                        width: 56,
                                        height: 56,
                                        borderRadius: 10,
                                        background: "#f3f3f3",
                                        flexShrink: 0,
                                        border: "1px solid #eee",
                                      }}
                                    />
                                  )}

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

                          {next && legKey && (
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "24px 1fr",
                                gap: 10,
                                alignItems: "stretch",
                                padding: "2px 0 6px 0",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "center",
                                }}
                              >
                                <div
                                  style={{
                                    width: 6,
                                    borderRadius: 999,
                                    background: "#cdeff0",
                                    minHeight: 56,
                                  }}
                                />
                              </div>

                              <div
                                style={{
                                  borderRadius: 12,
                                  padding: "8px 10px",
                                  background: "#fafafa",
                                  border: "1px dashed #e5e5e5",
                                  display: "grid",
                                  gap: 6,
                                }}
                              >
                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 13, opacity: 0.75 }}>交通</span>

                                  <select
                                    value={legMode}
                                    onChange={(e) => {
                                      // 點擊後，以改變後的值去setLegModeMap
                                      const nextMode = e.target.value as TravelMode;
                                      setLegModeMap((prev) => ({
                                        ...prev,  // 拷貝一份舊資料
                                        [legKey]: nextMode,  // 新增[legkey]: nextMode 這一項，如果[legkey]存在，就覆蓋掉原本的TravelMode
                                      }));
                                    }}
                                    style={{
                                      padding: "6px 8px",
                                      borderRadius: 10,
                                      border: "1px solid #ddd",
                                      background: "white",
                                    }}
                                  >
                                    <option value="DRIVING">開車</option>
                                    <option value="WALKING">步行</option>
                                    <option value="TRANSIT">大眾運輸</option>
                                  </select>

                                  <span style={{ fontSize: 13, opacity: 0.85 }}>
                                    {leg?.loading
                                      ? "計算中…"
                                      : leg?.error
                                      ? `失敗：${leg.error}`
                                      : `${formatDuration(leg?.durationMillis)} · ${formatDistance(leg?.distanceMeters)}`}
                                  </span>
                                </div>
                              </div>
                            </div>
                          )}
                        </Fragment>
                      )
                    })}
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
                  const thumbUrl = getThumbUrl(p.google_place_id);
                  return (
                    <li
                      key={p.destination_id}
                      style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, cursor: "pointer" }}
                      onClick={() => updatePreview(p.google_place_id, p.place_name)}
                    >
                      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                        {thumbUrl ? (
                          <img
                            src={thumbUrl}
                            alt={p.place_name ?? "place"}
                            style={{
                              width: 72,
                              height: 72,
                              objectFit: "cover",
                              borderRadius: 10,
                              flexShrink: 0,
                              border: "1px solid #eee",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: 72,
                              height: 72,
                              borderRadius: 10,
                              background: "#f3f3f3",
                              flexShrink: 0,
                              border: "1px solid #eee",
                            }}
                          />
                        )}

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontWeight: 800,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {p.place_name ?? `#${p.destination_id}`}
                          </div>

                          <div
                            style={{
                              fontSize: 13,
                              opacity: 0.75,
                              marginTop: 4,
                              wordBreak: "break-all",
                            }}
                          >
                            {p.city_name ? `${p.city_name} · ` : ""}
                            {p.google_place_id ?? ""}
                          </div>
                        </div>
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