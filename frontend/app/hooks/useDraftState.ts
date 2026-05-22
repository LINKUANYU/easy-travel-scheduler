// 職責：管理四個本地草稿狀態（景點順序、交通方式、時間、髒標記）
import { useState } from "react";
import type { ItineraryItem } from "@/app/lib/schemas";
import type { TravelMode } from "@/app/types/map";
import type { ItemTimeDraft } from "@/app/lib/edit/itinerary-time";

export function useDraftState(_activeDay: number) {
  // 每天的景點草稿排序，key 為 dayIndex
  const [draftItemsByDay, setDraftItemsByDay] = useState<Record<number, ItineraryItem[]>>({});

  // 每天每條路段的交通方式草稿，key 為 dayIndex → legKey
  const [draftLegModeByDay, setDraftLegModeByDay] = useState<
    Record<number, Record<string, TravelMode>>
  >({});

  // 每天每個景點的時間草稿，key 為 dayIndex → item_id
  const [timeDraftByDay, setTimeDraftByDay] = useState<
    Record<number, Record<number, ItemTimeDraft>>
  >({});

  // 記錄哪些天有未儲存的變更
  const [dirtyDayMap, setDirtyDayMap] = useState<Record<number, boolean>>({});

  return {
    draftItemsByDay, setDraftItemsByDay,
    draftLegModeByDay, setDraftLegModeByDay,
    timeDraftByDay, setTimeDraftByDay,
    dirtyDayMap, setDirtyDayMap,
  };
}
