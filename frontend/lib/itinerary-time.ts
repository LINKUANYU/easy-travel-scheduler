export type TimeField = "arrival_time" | "departure_time";

export type ItemTimeDraft = {
  arrival_time?: string | null;
  departure_time?: string | null;
};

export const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) =>
  String(i).padStart(2, "0")
);

export const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) =>
  String(i * 5).padStart(2, "0")
);

export function isValidTimeString(value?: string | null): value is string {
  return !!value && /^\d{2}:\d{2}$/.test(value);
}

export function splitTimeValue(value?: string | null) {
  if (isValidTimeString(value)) {
    const [hour, minute] = value.split(":");
    return { hour, minute };
  }

  return { hour: "09", minute: "00" };
}

export function joinTimeValue(hour: string, minute: string) {
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

export function formatTimeLabel(value?: string | null) {
  return isValidTimeString(value) ? value : "--:--";
}

export function timeToMinutes(value?: string | null) {
  if (!isValidTimeString(value)) return null;

  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function minutesToTimeValue(totalMinutes: number) {
  const safe = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function suggestArrivalTime(
  departureTime?: string | null,
  durationMillis?: number
) {
  const departureMinutes = timeToMinutes(departureTime);
  if (departureMinutes === null) return null;
  if (typeof durationMillis !== "number") return null;

  const travelMinutes = Math.round(durationMillis / 60000);
  return minutesToTimeValue(departureMinutes + travelMinutes);
}

export function upsertItemTimeDraft(
  draftMap: Record<number, ItemTimeDraft>,
  itemId: number,
  patch: Partial<ItemTimeDraft>
) {
  return {
    ...draftMap,
    [itemId]: {
      arrival_time: draftMap[itemId]?.arrival_time ?? null,
      departure_time: draftMap[itemId]?.departure_time ?? null,
      ...patch,
    },
  };
}

export function getDraftTimeValue(
  draftMap: Record<number, ItemTimeDraft>,
  itemId: number,
  field: TimeField,
  fallback?: string | null
) {
  const value = draftMap[itemId]?.[field];
  return value ?? fallback ?? null;
}