// TripMap.tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import { loadGoogleMaps } from "@/lib/googleMapsLoader";
import type { PlacePreview } from "@/lib/placePreview";

type TripPlace = {
  destination_id: number;
  place_name?: string;
  lat?: number | null;
  lng?: number | null;
  google_place_id?: string;
};

// 這是為了防止 XSS 攻擊做轉譯
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

export default function TripMap({
  places,  // 上層傳進來的景點
  preview,  // 
  topLeft,
  onAddPreview,  // preview 中的「加入trip」，callback 回傳給上層
  onClearPreview,  // preview 中的「關閉預覽、X」，callback 回傳給上層
  isAddingPreview,
}: {
  places: TripPlace[];
  preview?: PlacePreview | null;
  topLeft?: React.ReactNode;
  onAddPreview?: (placeId: string) => void;
  onClearPreview?: () => void;
  isAddingPreview?: boolean;
}) {
  /** Ref特性：不觸發re-render、裡面東西不會消失
  Google Map / Marker 是「外部物件」，不應該放在 React state（state 變動會觸發 re-render，反而干擾）
  useRef 可以跨 render 保存同一個物件實例
   */

  const divRef = useRef<HTMLDivElement | null>(null);  // 掛地圖的div
  const mapRef = useRef<google.maps.Map | null>(null);  // 儲存 google.maps.Map 的實例。

  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);  // 一個存放 AdvancedMarkerElement（進階標記）的陣列。
  const previewMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);  // 儲存「正在預覽但還沒加入行程」的那一個標記。
  const infoRef = useRef<google.maps.InfoWindow | null>(null);  // 儲存彈出的白色資訊視窗。

  const uidRef = useRef(`pv_${Math.random().toString(36).slice(2)}`);
  // 因為 InfoWindow 是用「HTML 字串」寫成的，不是真正的 React 元件。為了能在 document.getElementById 準確抓到這個視窗裡的按鈕，你需要一個唯一的 ID。

  // 檢查place送進來的資料，lat/lng 不是 number 的就不要畫 marker，避免地圖 API 報錯
  const valid = useMemo(
    () => places.filter((p) => typeof p.lat === "number" && typeof p.lng === "number"),
    [places]
  );

  // 檢查preview送進來的資料
  const previewValid =  // 三個都是true，previewvalid 才存在
    !!preview &&    // !! 可以將東西轉成true、false ，所以意思是 preview 要是true
    typeof preview.lat === "number" &&  // preview.lat 要是number
    typeof preview.lng === "number";  // preview.lng 要是number

  // 地圖初始化 + 每次更新都走這裡，只要這些東西變了[valid, preview?.id, previewValid, isAddingPreview, onAddPreview, onClearPreview]
  useEffect(() => {
    if (!divRef.current) return;

    let cancelled = false;

    async function boot() {
      const { Map, AdvancedMarkerElement, PinElement } = await loadGoogleMaps();
      if (cancelled) return;

      // 1) init map once，mapRef.current 一旦有值，就不會再 new Map。
      if (!mapRef.current) {
        const center =
          previewValid
            ? { lat: preview!.lat as number, lng: preview!.lng as number }  // 預覽點存在就看他
            : valid[0]  
              ? { lat: valid[0].lat as number, lng: valid[0].lng as number }
              : { lat: 35.681236, lng: 139.767125 };

        // 召喚地圖物件
        mapRef.current = new Map(divRef.current!, {
          center,  
          zoom: 12, // 縮放層級
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? "DEMO_MAP_ID", // Map 的外觀樣式
          streetViewControl: false,  // 關閉小黃人
          mapTypeControl: false,  // 關閉衛星/地圖切換
          fullscreenControl: false,  // 關閉全螢幕按鈕
          mapTypeControlOptions: { position: 0 as any },
        });

        infoRef.current = new google.maps.InfoWindow();
      }

      const map = mapRef.current!;

      // 2) clear old trip markers，清除所有舊圖釘
      // 在 Google Maps API 中，要讓一個圖釘消失要把它的 map 屬性設為 null
      for (const m of markersRef.current) m.map = null;  // 把所有圖釘從Ref內設成null
      markersRef.current = []; // 清空

      // clear preview marker + infowindow  清除預覽點與對話框
      if (previewMarkerRef.current) previewMarkerRef.current.map = null;
      previewMarkerRef.current = null;  
      infoRef.current?.close();

      // 3) 按照trip清單建立圖釘
      for (let i = 0; i < valid.length; i++) {
        const p = valid[i];
        const pin = new PinElement({ glyphText: String(i + 1) });  // 設定圖釘的數字

        const am = new AdvancedMarkerElement({
          map,  // 要放在哪個map
          position: { lat: p.lat as number, lng: p.lng as number }, // 放的位置
          title: p.place_name ?? `#${p.destination_id}`,  //
          content: pin,  //  圖釘長什麼樣子？上面做的數字模樣
        });

        markersRef.current.push(am);  // 放到Ref中
      }

      // 4) 建立預覽圖釘、預覽視窗infowindow ( 按鈕寫在 html 字串)
      if (previewValid) {
        const pin = new PinElement({ glyphText: "★" });
        const am = new AdvancedMarkerElement({
          map,
          position: { lat: preview!.lat as number, lng: preview!.lng as number },
          title: preview!.name ?? preview!.id,
          content: pin,
        });
        previewMarkerRef.current = am;

        const addId = `${uidRef.current}_${preview!.id}_add`;
        const clearId = `${uidRef.current}_${preview!.id}_clear`;

        const photosHtml = (preview!.photoUrls ?? [])
          .slice(0, 3)
          .map(
            (u:PlacePreview) =>
              `<img src="${escapeHtml(u)}" style="width:84px;height:64px;object-fit:cover;border-radius:10px;margin-right:8px;border:1px solid #eee;" />`
          )
          .join("");

        const html = `
          <div style="max-width:320px">
            <div style="font-weight:800;font-size:16px;margin-bottom:4px">
              ${escapeHtml(preview!.name ?? preview!.id)}
            </div>
            ${
              preview!.address
                ? `<div style="font-size:13px;opacity:.8;margin-bottom:10px">${escapeHtml(
                    preview!.address
                  )}</div>`
                : ""
            }
            ${photosHtml ? `<div style="display:flex;margin-bottom:10px">${photosHtml}</div>` : ""}

            <div style="display:flex;gap:8px;align-items:center">
              <button id="${addId}" style="
                padding:8px 10px;border-radius:10px;border:1px solid #ddd;background:white;
                font-weight:700;cursor:pointer;
              ">
                加入 Trip
              </button>

              <button id="${clearId}" style="
                padding:8px 10px;border-radius:10px;border:1px solid #ddd;background:white;
                cursor:pointer;
              ">
                清除預覽
              </button>

              ${
                preview!.googleMapsURI
                  ? `<a href="${escapeHtml(preview!.googleMapsURI)}" target="_blank" rel="noreferrer" style="font-size:13px">開啟 Google Maps</a>`
                  : ""
              }
            </div>
          </div>
        `;
        
        // 把html 塞入info
        infoRef.current!.setContent(html);
        // 讓 InfoWindow 永遠在最上層
        infoRef.current!.setOptions({ zIndex: 999999 });
        // 畫面登場
        infoRef.current!.open({ map, anchor: am as any }); // 設定了 anchor，視窗就會自動對齊圖釘的尖端彈出來。
        // 清除「X 關閉」的監聽事件（google預設)
        google.maps.event.clearListeners(infoRef.current!, "closeclick");
        // 手動設定「X 關閉」的監聽事件
        infoRef.current!.addListener("closeclick", () => {
          onClearPreview?.();
        });
        
        // 綁定infowindow 內的事件
        // domready：把 HTML 內的 button click 連回 React callback
        google.maps.event.addListenerOnce(infoRef.current!, "domready", () => {
          const addBtn = document.getElementById(addId) as HTMLButtonElement | null;
          const clearBtn = document.getElementById(clearId) as HTMLButtonElement | null;

          if (addBtn) {
            // 如果你要顯示 pending（簡單版：點了就改文字、disable）
            if (isAddingPreview) {
              addBtn.disabled = true;
              addBtn.innerText = "Adding…";
              addBtn.style.opacity = "0.7";
              addBtn.style.cursor = "not-allowed";
            }

            addBtn.addEventListener("click", (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              // 它告訴瀏覽器「這個點擊事件到此為止，不要再往地層傳下去了」
              // 地圖本身也有「點擊監聽器」（例如點擊地圖空白處會關閉視窗）。
              // 當你點擊 InfoWindow 裡的按鈕時，如果你不寫這行，點擊事件會「穿透」按鈕，傳給地圖。
              // 地圖會以為你點了地圖背景，結果：你才剛按下「加入」，地圖就以為你要關掉視窗，導致泡泡瞬間消失。

              addBtn.disabled = true;
              addBtn.innerText = "Adding…";
              addBtn.style.opacity = "0.7";
              addBtn.style.cursor = "not-allowed";

              onAddPreview?.(preview!.id);
            });
          }

          if (clearBtn) {
            clearBtn.addEventListener("click", (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              onClearPreview?.();
            });
          }
        });

        map.panTo({ lat: preview!.lat as number, lng: preview!.lng as number }); // MAP 平滑滑行
        map.setZoom(15);
      }

      // 5) 設定地圖畫面的邊界 fit bounds：包含 trip + preview
      const pts: Array<{ lat: number; lng: number }> = [];  // 宣告一個陣列
      for (const p of valid) pts.push({ lat: p.lat as number, lng: p.lng as number });  // 把既有地點塞進去
      if (previewValid) pts.push({ lat: preview!.lat as number, lng: preview!.lng as number });  // 把preview 塞進去

      if (pts.length > 1) {
        const bounds = new google.maps.LatLngBounds();  // 建立一個「邊界盒子」
        for (const p of pts) bounds.extend(p);  // 每當你執行一次 bounds.extend(p)，這個隱形的矩形就會自動「撐大」，直到剛好能裝下這個座標點 p。
        map.fitBounds(bounds);  // 自動調整你的中心點和縮放層級 (Zoom)，讓畫面剛好裝下這個隱形矩形。
      }
    }

    boot();

    // 清除資料：當元件被銷毀（例如使用者換頁）或是 useEffect 準備重新執行前，React 會先執行這段。避免記憶體洩漏
    return () => {
      cancelled = true;
      for (const m of markersRef.current) m.map = null;
      markersRef.current = [];

      if (previewMarkerRef.current) previewMarkerRef.current.map = null;
      previewMarkerRef.current = null;

      infoRef.current?.close();
    };
  }, [valid, preview?.id, previewValid, isAddingPreview, onAddPreview, onClearPreview]);

  return (
    <div
      style={{
        position: "relative",
        height: "70vh",
        width: "100%",
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #ddd",
      }}
    >
      <div ref={divRef} style={{ height: "100%", width: "100%" }} />

      {/* ✅ 地圖左上角放 PlaceAutocompleteInput */}
      {topLeft && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            width: 420,
            zIndex: 2,
            background: "white",
            borderRadius: 12,
            border: "1px solid #eee",
            boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
            padding: 10,
          }}
        >
          {topLeft}
        </div>
      )}
    </div>
  );
}