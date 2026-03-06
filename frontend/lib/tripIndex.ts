export type TripIndexItem = {
  trip_id: number;
  title: string;
  days: number;
  start_date?: string | null;
  created_at_ms: number;
};

const KEY = "easy_travel_trip_index_v1";

export function readTripIndex(): TripIndexItem[] {
  if (typeof window === "undefined") return []; // 這是在檢查「現在是不是在瀏覽器環境？」。因為 Next.js 會在伺服器端執行程式，但伺服器沒有 LocalStorage，所以如果是伺服器端，就直接回傳空的（[]）。
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as TripIndexItem[]) : [];
  } catch {
    return [];
  }
}

export function upsertTripIndex(item: Omit<TripIndexItem, "created_at_ms">) {  // Omit 代表排除created_at_ms，當我呼叫這個函式時，我只需要傳入「標題、天數」等資訊，不用手動傳入時間，時間會由程式自動產生。
  if (typeof window === "undefined") return;
  const current = readTripIndex();
  const next: TripIndexItem = { ...item, created_at_ms: Date.now() };

  const filtered = current.filter((x) => x.trip_id !== item.trip_id);  // 如果出現一樣的trip_id 就踢掉，不一樣的才留下
  const merged = [next, ...filtered].sort((a, b) => b.created_at_ms - a.created_at_ms);  // 排序，時間新的在前

  window.localStorage.setItem(KEY, JSON.stringify(merged));  // 寫入localstorage
}