// 大總管：組合各子 Hook，並持有 Mutations、Actions、衍生資料
import { useState, useMemo, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { arrayMove } from "@dnd-kit/sortable";
import { apiPost, apiPut, apiDelete } from "@/app/lib/api";
import { getDraftTimeValue, upsertItemTimeDraft, type TimeField } from "@/app/lib/edit/itinerary-time";
import { makeLegKey } from "@/app/lib/edit/itinerary-route-leg";
import type { TripPlace } from "@/app/types/trip";
import type { ItineraryItem } from "@/app/types/itinerary";
import type { TravelMode } from "@/app/types/map";
import { useRouteCalculator } from "./useRouteCalculator";
import { usePlacePreview } from "./usePlacePreview";
import { useItineraryQueries } from "./useItineraryQueries";
import { useDraftState } from "./useDraftState";

export function useEditData(tripId: number, days: number) {
  const qc = useQueryClient();
  const [uiMsg, setUiMsg] = useState<string>("");
  // activeDay 留在大總管，因為是兩個子 Hook 的共享輸入
  const [activeDay, setActiveDay] = useState(1);

  const { preview, setPreview, previewLoading, previewErr, updatePreview } = usePlacePreview();

  // 子 Hook：資料獲取
  const { placesQ, summaryQ, dayItinQ } = useItineraryQueries(tripId, activeDay);

  // 子 Hook：草稿狀態
  const {
    draftItemsByDay, setDraftItemsByDay,
    draftLegModeByDay, setDraftLegModeByDay,
    timeDraftByDay, setTimeDraftByDay,
    dirtyDayMap, setDirtyDayMap,
  } = useDraftState(activeDay);

  const places = useMemo(() => placesQ.data ?? [], [placesQ.data]);
  const serverDayItems = dayItinQ.data ?? [];
  const dayItems = draftItemsByDay[activeDay] ?? serverDayItems;
  const currentDayLegModeMap = draftLegModeByDay[activeDay] ?? {};
  const currentDayTimeDraftMap = timeDraftByDay[activeDay] ?? {};

  // ==========================================
  // Derived State (衍生資料)
  // ==========================================
  // 建立查找 Map，用於判斷景點是否已加入行程
  const scheduledMap = useMemo(() => {
    const m = new Map<number, NonNullable<typeof summaryQ.data>[number]>();
    for (const r of summaryQ.data ?? []) m.set(r.destination_id, r);
    return m;
  }, [summaryQ.data]);

  // 複製景點池並依「是否已排程」排序，未排程在前
  const sortedPlaces = useMemo(() => {
    const arr = places.slice();
    arr.sort((a, b) => {
      const as = scheduledMap.has(a.destination_id) ? 1 : 0;
      const bs = scheduledMap.has(b.destination_id) ? 1 : 0;
      if (as !== bs) return as - bs;
      return 0;
    });
    return arr;
  }, [places, scheduledMap]);

  // 以 destination_id 為 key 的景點查找 Map，確保行程中的景點座標來自單一事實來源
  const placeByDestinationId = useMemo(() => {
    const m = new Map<number, TripPlace>();
    for (const p of places) m.set(p.destination_id, p);
    return m;
  }, [places]);

  const { legRouteMap } = useRouteCalculator(dayItems, currentDayLegModeMap, placeByDestinationId);

  // 同步伺服器資料到本地草稿
  useEffect(() => {
    if (!dayItinQ.isSuccess) return;

    // 1. 同步景點順序（只在尚無草稿時才初始化）
    setDraftItemsByDay((prev) => prev[activeDay] ? prev : { ...prev, [activeDay]: serverDayItems });

    // 2. 同步交通方式（只在尚無草稿時才初始化）
    if (draftLegModeByDay[activeDay]) return;

    const modeMap: Record<string, TravelMode> = {};
    serverDayItems.forEach((item, idx) => {
      const nextItem = serverDayItems[idx + 1];
      if (nextItem && item.travel_mode) {
        const legKey = makeLegKey(item.item_id, nextItem.item_id);
        modeMap[legKey] = item.travel_mode as TravelMode;
      }
    });
    setDraftLegModeByDay((prev) => ({ ...prev, [activeDay]: modeMap }));
  }, [activeDay, dayItinQ.isSuccess, serverDayItems, draftLegModeByDay]);

  // ==========================================
  // Mutations (資料變更)
  // ==========================================

  // [新增景點到景點池]
  const addPlaceM = useMutation({
    mutationFn: async (google_place_id: string) =>
      apiPost(`/api/trips/${tripId}/places`, { google_place_id }),
    onSuccess: async () => {
      setUiMsg("已加入！");
      await qc.invalidateQueries({ queryKey: ["tripPlaces", tripId] });
      window.setTimeout(() => setUiMsg(""), 1500);
    },
  });

  // [移除景點池裡的景點]
  const removePlaceM = useMutation({
    mutationFn: async (destination_id: number) =>
      apiDelete(`/api/trips/${tripId}/places/${destination_id}`),
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
      setDraftItemsByDay((prev) => ({
        ...prev,
        [dayIndex]: (prev[dayIndex] ?? []).filter((x) => x.item_id !== item_id),
      }));
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
      // 沒有變更時直接返回，不打 API
      if (!dirtyDayMap[dayIndex]) return { is_empty_bypass: true };

      const items = draftItemsByDay[dayIndex] ?? [];
      if (items.length === 0) return { is_empty_bypass: true };

      const payload = {
        ordered_item_ids: items.map((x) => x.item_id),
        item_times: items.map((item) => ({
          item_id: item.item_id,
          arrival_time: getDraftTimeValue(timeDraftByDay[dayIndex] ?? {}, item.item_id, "arrival_time", item.arrival_time ?? null),
          departure_time: getDraftTimeValue(timeDraftByDay[dayIndex] ?? {}, item.item_id, "departure_time", item.departure_time ?? null),
        })),
        legs: items.slice(0, -1).map((from, idx) => {
          const to = items[idx + 1];
          const legKey = makeLegKey(from.item_id, to.item_id);
          const routeResult = legRouteMap[legKey];
          return {
            from_item_id: from.item_id,
            to_item_id: to.item_id,
            travel_mode: (draftLegModeByDay[dayIndex] ?? {})[legKey] || null,
            duration_millis: routeResult?.durationMillis ?? null,
            distance_meters: routeResult?.distanceMeters ?? null,
          };
        }),
      };
      return apiPut(`/api/trips/${tripId}/days/${dayIndex}/itinerary/save`, payload);
    },
    onSuccess: async (data: any, dayIndex) => {
      setDirtyDayMap((prev) => ({ ...prev, [dayIndex]: false }));
      setUiMsg("儲存成功！");
      window.setTimeout(() => setUiMsg(""), 1500);
      if (data?.is_empty_bypass) return;
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

  async function goToDay(nextDay: number) {
    if (nextDay < 1 || nextDay > days || nextDay === activeDay) return;
    if (dirtyDayMap[activeDay]) await saveDayDraftM.mutateAsync(activeDay);
    setActiveDay(nextDay);
  }

  function applyItemTime(item: ItineraryItem, field: TimeField, value: string | null) {
    setTimeDraftByDay((prev) => {
      const nextDraftMap = upsertItemTimeDraft(prev[activeDay] ?? {}, item.item_id, { [field]: value });
      return { ...prev, [activeDay]: nextDraftMap };
    });
    setDirtyDayMap((prev) => ({ ...prev, [activeDay]: true }));
  }

  function clearItemTime(item: ItineraryItem, field: TimeField) {
    setTimeDraftByDay((prev) => ({
      ...prev,
      [activeDay]: upsertItemTimeDraft(prev[activeDay] ?? {}, item.item_id, { [field]: null }),
    }));
    setDirtyDayMap((prev) => ({ ...prev, [activeDay]: true }));
  }

  function updateCurrentDayLegMode(legKey: string, mode: TravelMode) {
    setDraftLegModeByDay((prev) => ({
      ...prev,
      [activeDay]: { ...(prev[activeDay] ?? {}), [legKey]: mode },
    }));
    setDirtyDayMap((prev) => ({ ...prev, [activeDay]: true }));
  }

  function onDragEnd(event: any) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const ids = dayItems.map((x) => x.item_id);
    const oldIndex = ids.indexOf(active.id);
    const newIndex = ids.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const newItems = arrayMove(dayItems, oldIndex, newIndex);
    setDraftItemsByDay((prev) => ({ ...prev, [activeDay]: newItems }));
    setDirtyDayMap((prev) => ({ ...prev, [activeDay]: true }));
  }

  return {
    uiMsg, activeDay, prevDay: () => goToDay(activeDay - 1), nextDay: () => goToDay(activeDay + 1),
    places, sortedPlaces, scheduledMap, placeByDestinationId,
    dayItems, currentDayLegModeMap, currentDayTimeDraftMap, dirtyDayMap,
    preview, previewLoading, previewErr, updatePreview, setPreview,
    applyItemTime, clearItemTime, updateCurrentDayLegMode, onDragEnd,
    legRouteMap,
    getItemTimeValue: (item: ItineraryItem, field: TimeField) =>
      getDraftTimeValue(
        currentDayTimeDraftMap,
        item.item_id,
        field,
        field === "arrival_time" ? item.arrival_time ?? null : item.departure_time ?? null
      ),
    placesQ, dayItinQ, summaryQ,
    addPlaceM, removePlaceM, addToDayM, removeItemM, saveDayDraftM,
  };
}
