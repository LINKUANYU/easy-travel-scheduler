// app/edit/[tripId]/hooks/useEditData.ts
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { arrayMove } from "@dnd-kit/sortable";
import { apiGet, apiPost, apiPut, apiDelete } from "@/app/lib/api";
import { getDraftTimeValue, upsertItemTimeDraft, type TimeField, type ItemTimeDraft } from "@/app/lib/edit/itinerary-time";
import { makeLegKey } from "@/app/lib/edit/itinerary-route-leg";
import type { TripPlace, ItineraryItem, ItinerarySummaryRow, TravelMode } from "@/app/types/all-types";
import { useRouteCalculator } from "./useRouteCalculator";
import { usePlacePreview } from "./usePlacePreview";

// 輔助函式
function normalizeArrayPayload<T>(payload: any): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && Array.isArray(payload.data)) return payload.data as T[];
  return [];
}

export function useEditData(tripId: number, days: number) {
  const qc = useQueryClient();  // React Query 快取管理中心
  const [uiMsg, setUiMsg] = useState<string>("");  // UI 提示訊息 (如: 已加入、失敗等)
  const [activeDay, setActiveDay] = useState(1);

  const { preview, setPreview, previewLoading, previewErr, updatePreview } = usePlacePreview();

  // 本地草稿狀態
  const [draftItemsByDay, setDraftItemsByDay] = useState<Record<number, ItineraryItem[]>>({});
  const [draftLegModeByDay, setDraftLegModeByDay] = useState<Record<number, Record<string, TravelMode>>>({});
  const [timeDraftByDay, setTimeDraftByDay] = useState<Record<number, Record<number, ItemTimeDraft>>>({});
  const [dirtyDayMap, setDirtyDayMap] = useState<Record<number, boolean>>({});

  // ==========================================
  // Queries (資料獲取)
  // ==========================================
  // 景點池：獲取此行程所有「已儲存」但尚未必「已排程」的地點
  const placesQ = useQuery({
    queryKey: ["tripPlaces", tripId],
    queryFn: async () => normalizeArrayPayload<TripPlace>(await apiGet(`/api/trips/${tripId}/places`)),
  });
  // 行程摘要：用來快速對照哪些景點「已經出現在哪一天」
  const summaryQ = useQuery({
    queryKey: ["itinerarySummary", tripId],
    queryFn: async () => normalizeArrayPayload<ItinerarySummaryRow>(await apiGet(`/api/trips/${tripId}/itinerary/summary`)),
  });
  // 當日明細：獲取特定某一天 (activeDay) 的具體景點排序資料
  const dayItinQ = useQuery({
    queryKey: ["dayItinerary", tripId, activeDay],
    queryFn: async () => normalizeArrayPayload<ItineraryItem>(await apiGet(`/api/trips/${tripId}/days/${activeDay}/itinerary`)),
  });

  const places = useMemo(() => placesQ.data ?? [], [placesQ.data]);
  const serverDayItems = dayItinQ.data ?? [];
  const dayItems = draftItemsByDay[activeDay] ?? serverDayItems;
  const currentDayLegModeMap = draftLegModeByDay[activeDay] ?? {};
  const currentDayTimeDraftMap = timeDraftByDay[activeDay] ?? {};

  // 同步伺服器資料到草稿
  useEffect(() => {
    if (!dayItinQ.isSuccess) return;
    setDraftItemsByDay((prev) => prev[activeDay] ? prev : { ...prev, [activeDay]: serverDayItems });
  }, [activeDay, dayItinQ.isSuccess, serverDayItems]);

  // ==========================================
  // Derived State (衍生資料)
  // ==========================================
  // 建立查找 Map 給後續查找景點是否已加入Itinerary用，Map 資料結構等同於python dict
  const scheduledMap = useMemo(() => {
    const m = new Map<number, ItinerarySummaryRow>();
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
    for (const p of places) m.set(p.destination_id, p);
    return m;
  }, [places]);

  const { legRouteMap } = useRouteCalculator(dayItems, currentDayLegModeMap, placeByDestinationId);

  // ==========================================
  // Mutations (資料變更)
  // ==========================================
  
  // [新增景點到景點池]
  const addPlaceM = useMutation({
    mutationFn: async (google_place_id: string) => apiPost(`/api/trips/${tripId}/places`, { google_place_id }),
    onSuccess: async () => {
      setUiMsg("已加入！");
      await qc.invalidateQueries({ queryKey: ["tripPlaces", tripId] });
      window.setTimeout(() => setUiMsg(""), 1500);
    },
  });
  
  // [移除景點池裡的景點]
  const removePlaceM = useMutation({
    mutationFn: async (destination_id: number) => apiDelete(`/api/trips/${tripId}/places/${destination_id}`),
    onSuccess: async () => qc.invalidateQueries({ queryKey: ["tripPlaces", tripId] }),
    onError: (e: any) => setUiMsg(`加入失敗：${e?.message || "unknown error"}`),
  });
  
  // [將景點池裡的景點加入當日排程]
  const addToDayM = useMutation({
    mutationFn: async ({ dayIndex, destination_id }: { dayIndex: number; destination_id: number }) => 
      apiPost<ItineraryItem>(`/api/trips/${tripId}/days/${dayIndex}/itinerary`, { destination_id }),
    onSuccess: async (newItem, { dayIndex }) => {
      setDraftItemsByDay((prev) => ({ ...prev, [dayIndex]: [...(prev[dayIndex] ?? []), newItem] }));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["itinerarySummary", tripId] }),
        qc.invalidateQueries({ queryKey: ["dayItinerary", tripId, dayIndex] }),
      ]);
    },
    onError: (e: any) => {
      setUiMsg(`加入行程失敗：${e?.message || "unknown error"}`);
      window.setTimeout(() => setUiMsg(""), 1500);
    },
  });
  
  // [將當日排程內的景點移除]
  const removeItemM = useMutation({
    mutationFn: async ({ dayIndex, item_id }: { dayIndex: number; item_id: number }) => 
      apiDelete(`/api/trips/${tripId}/itinerary/${item_id}`),
    onSuccess: async (_, { dayIndex, item_id }) => {
      setDraftItemsByDay((prev) => ({ ...prev, [dayIndex]: (prev[dayIndex] ?? []).filter((x) => x.item_id !== item_id) }));
      setTimeDraftByDay((prev) => {
        const dayMap = { ...(prev[dayIndex] ?? {}) };
        delete dayMap[item_id];
        return { ...prev, [dayIndex]: dayMap };
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["itinerarySummary", tripId] }),
        qc.invalidateQueries({ queryKey: ["dayItinerary", tripId, dayIndex] }),
      ]);
    },
    onError: (e: any) => {
      setUiMsg(`移除行程失敗：${e?.message || "unknown error"}`);
      window.setTimeout(() => setUiMsg(""), 1500);
    },
  });

  const saveDayDraftM = useMutation({
    mutationFn: async (dayIndex: number) => {
      const payload = {
        ordered_item_ids: (draftItemsByDay[dayIndex] ?? []).map((x) => x.item_id),
        item_times: (draftItemsByDay[dayIndex] ?? []).map((item) => ({
          item_id: item.item_id,
          arrival_time: getDraftTimeValue(timeDraftByDay[dayIndex] ?? {}, item.item_id, "arrival_time", item.arrival_time ?? null),
          departure_time: getDraftTimeValue(timeDraftByDay[dayIndex] ?? {}, item.item_id, "departure_time", item.departure_time ?? null),
        })),
        legs: (draftItemsByDay[dayIndex] ?? []).slice(0, -1).map((from, idx) => {
          const to = (draftItemsByDay[dayIndex] ?? [])[idx + 1];
          const legKey = makeLegKey(from.item_id, to.item_id);
          const routeResult = legRouteMap[legKey];
          return {
            from_item_id: from.item_id,
            to_item_id: to.item_id,
            travel_mode: (draftLegModeByDay[dayIndex] ?? {})[legKey] ?? "DRIVING",
            duration_millis: routeResult.durationMillis ?? null,
            distance_meters: routeResult.distanceMeters ?? null,
          };
        }),
      };
      return apiPut(`/api/trips/${tripId}/days/${dayIndex}/itinerary/save`, payload);
    },
    onSuccess: async (_, dayIndex) => {
      setDirtyDayMap((prev) => ({ ...prev, [dayIndex]: false }));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["dayItinerary", tripId, dayIndex] }),
        qc.invalidateQueries({ queryKey: ["itinerarySummary", tripId] }),
      ]);
    },
    onError: (e: any) => {
      setUiMsg(`儲存失敗：${e?.message || "unknown error"}`);
      window.setTimeout(() => setUiMsg(""), 1500);
    },
  });

  // ==========================================
  // Actions (操作行為)
  // ==========================================
  // Day 切換按鈕
  async function goToDay(nextDay: number) {
    if (nextDay < 1 || nextDay > days || nextDay === activeDay) return;
    if (dirtyDayMap[activeDay]) await saveDayDraftM.mutateAsync(activeDay);
    setActiveDay(nextDay);
  }

  function applyItemTime(item: ItineraryItem, field: TimeField, value: string | null) {
    setTimeDraftByDay((prev) => {
      let nextDraftMap = upsertItemTimeDraft(prev[activeDay] ?? {}, item.item_id, { [field]: value });
      return { ...prev, [activeDay]: nextDraftMap };
    });
    setDirtyDayMap((prev) => ({ ...prev, [activeDay]: true }));
  }

  function clearItemTime(item: ItineraryItem, field: TimeField) {
    setTimeDraftByDay((prev) => ({
      ...prev, [activeDay]: upsertItemTimeDraft(prev[activeDay] ?? {}, item.item_id, { [field]: null })
    }));
    setDirtyDayMap((prev) => ({ ...prev, [activeDay]: true }));
  }

  function updateCurrentDayLegMode(legKey: string, mode: TravelMode) {
    setDraftLegModeByDay((prev) => ({
      ...prev, [activeDay]: { ...(prev[activeDay] ?? {}), [legKey]: mode },
    }));
    setDirtyDayMap((prev) => ({ ...prev, [activeDay]: true }));
  }

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
    setDraftItemsByDay((prev) => ({ ...prev, [activeDay]: newItems }));
    setDirtyDayMap((prev) => ({ ...prev, [activeDay]: true }));
  }
  /**
  整體架構中的運作流程圖
  使用者動作：滑鼠點擊 ⠿ 並移動超過 6px（sensors 認可動作）。
  視覺回饋：SortableRow 接收到 useSortable 的指令，讓元件變透明並跟著滑鼠跑。
  動作結束：使用者放開滑鼠，觸發 onDragEnd。
   */

  return {
    uiMsg, activeDay, prevDay: () => goToDay(activeDay - 1), nextDay: () => goToDay(activeDay + 1),
    places, sortedPlaces, scheduledMap, placeByDestinationId,
    dayItems, currentDayLegModeMap, currentDayTimeDraftMap, dirtyDayMap,
    preview, previewLoading, previewErr, updatePreview, setPreview,
    applyItemTime, clearItemTime, updateCurrentDayLegMode, onDragEnd,
    legRouteMap,
    getItemTimeValue: (item: ItineraryItem, field: TimeField) => getDraftTimeValue(currentDayTimeDraftMap, item.item_id, field, field === "arrival_time" ? item.arrival_time ?? null : item.departure_time ?? null),
    placesQ, dayItinQ, summaryQ,
    addPlaceM, removePlaceM, addToDayM, removeItemM, saveDayDraftM
  };
}