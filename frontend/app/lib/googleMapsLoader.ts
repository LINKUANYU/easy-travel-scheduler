import { setOptions, importLibrary } from "@googlemaps/js-api-loader";

// 用來確保只呼叫一次
let configured = false;

// 只做一次 setOptions（官方建議只呼叫一次）
function ensureConfigured() {
  if (configured) return;

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");

  // 注意：新版用 key / v（不是 apiKey / version）
  setOptions({
    key,
    v: "weekly",
    // libraries 可不填，因為我們用 importLibrary 動態載入
    // libraries: ["places"],
  });

  configured = true;
}

function ensureBrowser() {
  if (typeof window === "undefined") {
    throw new Error("Google Maps can only load in browser.");
  }
}


/** 載入 Places library（Autocomplete / PlaceAutocompleteElement 都在這個 library）負責搜尋與地理資訊
Autocomplete：地址自動補完（當你在搜尋框打「台北」，它會跳出「台北 101」、「台北車站」）。
PlaceAutocompleteElement：新版的 Web Component 搜尋框，直接丟到 HTML 就能用。
PlacesService：用來查詢某個地點的詳細資訊（評論、電話、營業時間、照片）。
 */
export async function loadPlacesLibrary(): Promise<google.maps.PlacesLibrary> {
  ensureBrowser();
  ensureConfigured();

  // v2 用 importLibrary() 動態載入
  return (await importLibrary("places")) as google.maps.PlacesLibrary;
}

/** Maps library（Map / LatLngBounds 等） 用來拿地圖
設定地圖中心點、縮放層級（Zoom）。切換地圖類型（衛星圖、地形圖、街道圖）。控制地圖上的 UI（縮放按鈕、全螢幕按鈕）。
*/
export async function loadMapsLibrary(): Promise<google.maps.MapsLibrary> {
  ensureBrowser();
  ensureConfigured();
  return (await importLibrary("maps")) as google.maps.MapsLibrary;
}

/** Marker library（AdvancedMarkerElement / PinElement 等） 這是地圖上的「大頭針」與「標註」。
AdvancedMarkerElement：新版的標記工具。它不再只是圖片，而是可以放 HTML 和 CSS 的元件。
PinElement：用來快速自訂標記的顏色、外框、中心點（不需寫 CSS 也能換色）。
*/
export async function loadMarkerLibrary(): Promise<google.maps.MarkerLibrary> {
  ensureBrowser();
  ensureConfigured();
  return (await importLibrary("marker")) as google.maps.MarkerLibrary;
}

/**
 * 方便用：一次拿到 Map + Advanced Marker（places 可選）
 * - TripMap 會用到 maps + marker
 * - PlaceAutocompleteInput 會用到 places
 */
export async function loadGoogleMaps(opts?: { withPlaces?: boolean }) { // opts：options 看要不要把place也帶入
  ensureBrowser();
  ensureConfigured();

  // 解構賦值
  const [{ Map }, { AdvancedMarkerElement, PinElement }] = await Promise.all([
    loadMapsLibrary(),
    loadMarkerLibrary(),
  ]);

  if (opts?.withPlaces) {
    await loadPlacesLibrary();
  }

  return { Map, AdvancedMarkerElement, PinElement };
}

export async function loadRoutesLibrary(): Promise<google.maps.RoutesLibrary> {
  ensureBrowser();
  ensureConfigured();
  return (await importLibrary("routes")) as google.maps.RoutesLibrary;
}