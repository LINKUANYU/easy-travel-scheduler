// TripMap.tsx
"use client";

import { useEffect, useMemo, useRef } from "react";
import { loadGoogleMaps } from "@/app/lib/googleMapsLoader";
import type { PlacePreview } from "@/app/lib/planner/placePreview";
import type { TripPlace, ItinerarySummaryRow } from "@/app/types/all-types";


// 這是為了防止 XSS 攻擊做轉譯
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}


const DAY_COLORS = [
  "#1A73E8", "#34A853", "#FBBC05", "#EA4335",
  "#A142F4", "#00ACC1", "#F06292", "#7CB342",
];

function colorForDay(dayIndex: number) {
  return DAY_COLORS[(dayIndex - 1) % DAY_COLORS.length];
}

export default function TripMap({
  places,  // 上層傳進來的景點
  preview,  // 上層傳進來的資料(google input抓到的placeId 再去fetch 完的資料)
  topLeft,  // 放google input 
  onAddPreview,  // preview 中的「加入trip」，callback 回傳給上層
  onClearPreview,  // preview 中的「關閉預覽、X」，callback 回傳給上層
  isAddingPreview,
  scheduleSummary,
  activeDay,
  activeDayRoute,
  bottomRight,
  onPlaceClick, // 用來向外傳遞使用者點擊的 placeId
  readonly,     // 如果是唯讀模式 (Share頁面)，隱藏「加入 Trip」按鈕
}: {
  places: TripPlace[];
  preview?: PlacePreview | null;
  topLeft?: React.ReactNode;
  onAddPreview?: (placeId: string) => void;
  onClearPreview?: () => void;
  isAddingPreview?: boolean;
  scheduleSummary?: ItinerarySummaryRow[];
  activeDay?: number;
  activeDayRoute?: { lat: number; lng: number }[];
  bottomRight?: React.ReactNode;
  onPlaceClick?: (placeId: string) => void;
  readonly?: boolean;
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

  const hasInitialFit = useRef<boolean>(false); // 查看是否為第一次render的變數

  // 1. 新增一個 Ref 來追蹤線條物件
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  // 用來記錄「上一次」的 activeDay，預設為初次載入的天數
  const prevActiveDayRef = useRef<number | undefined>(activeDay);

  // 檢查place送進來的資料，lat/lng 不是 number 的就不要畫 marker，避免地圖 API 報錯
  const valid = useMemo(
    () => places.filter((p) => typeof p.lat === "number" && typeof p.lng === "number"),
    [places]
  );

  const schedMap = useMemo(
    () => {
      const m = new Map<number, ItinerarySummaryRow>();
      for ( const r of scheduleSummary ?? []) m.set(r.destination_id, r);
      return m;
    }, [scheduleSummary]
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
        const defaultCenter ={ lat: 35.681236, lng: 139.767125 };

        // 召喚地圖物件
        const mapInstance = new Map(divRef.current!, {
          center: defaultCenter,
          zoom: 12, // 縮放層級
          mapId: "DEMO_MAP_ID", // Map 的外觀樣式
          streetViewControl: false,  // 關閉小黃人
          mapTypeControl: false,  // 關閉衛星/地圖切換
          fullscreenControl: false,  // 關閉全螢幕按鈕
          mapTypeControlOptions: { position: 0 as any },
        });

        mapRef.current = mapInstance;
        infoRef.current = new google.maps.InfoWindow();
      }

      const map = mapRef.current!;

      // 監聽地圖上的原生景點 (POIs) 點擊事件
      google.maps.event.clearListeners(map, "click");
      map.addListener("click", (event: any) => {
        if (event.placeId) {
          event.stop(); // 阻止 Google 預設的白框彈出
          onPlaceClick?.(event.placeId); // 呼叫外層的 updatePreview
        }
      });

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
        // 3A) 如果有排入行程的話，改變圖釘樣式
        const sched = schedMap.get(p.destination_id)

        if (sched){
          const dayColor = colorForDay(sched.day_index)
          const isActive = activeDay ? sched.day_index === activeDay : false;
          const pin = new PinElement({ 
            glyphText: String(sched.position + 1),   // 設定圖釘的數字
            background: dayColor,
            glyphColor: "#ffffff",
            borderColor: isActive ? "#FFFFFF" : "rgba(0,0,0,0.3)",
            scale: isActive ? 2 : 1.5,
          } as any);

          const am = new AdvancedMarkerElement({
            map,  // 要放在哪個map
            position: { lat: p.lat as number, lng: p.lng as number }, // 放的位置
            title: p.place_name ?? `#${p.destination_id}`,  //
            content: pin,  //  圖釘長什麼樣子？上面做的數字模樣
            zIndex: isActive ? 10 :1
          });

          // 綁定點擊事件
          if (p.google_place_id) {
            am.addListener("click", () => {
              onPlaceClick?.(p.google_place_id as string);
            });
          }

          markersRef.current.push(am);  // 放到Ref中
          continue;
        }

        // 3B) 沒有排入行程的話，保持預設樣式
        const am = new AdvancedMarkerElement({
          map,  // 要放在哪個map
          position: { lat: p.lat as number, lng: p.lng as number }, // 放的位置
          title: p.place_name ?? `#${p.destination_id}`,  //
        });
        // 綁定點擊事件
        if (p.google_place_id) {
          am.addListener("click", () => {
            onPlaceClick?.(p.google_place_id as string);
          });
        }
        markersRef.current.push(am);  // 放到Ref中
      }

      // 4) 建立預覽圖釘、預覽視窗infowindow ( 按鈕寫在 html 字串)
      if (previewValid) {
        // 檢查這個預覽點是否已經在 places 陣列中
        const isAlreadyInTrip = places.some(
          (p) => p.google_place_id === preview!.id
        );
        
        const pin = new PinElement({ glyphText: "★" } as any);
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
            (u:any) =>
              `<img src="${escapeHtml(u)}" style="width:84px;height:64px;object-fit:cover;border-radius:10px;margin-right:8px;border:1px solid #eee;" />`
          )
          .join("");
        
        const addBtnHtml = readonly  // 如果是唯獨頁，就拿掉按鈕。如果是編輯頁，顯示按鈕
        ? ""
        : (isAlreadyInTrip
          ? `<button id="${addId}" disabled style="
              padding:8px 12px; border-radius:10px; border:1px solid #eee;
              background:#f5f5f5; color:#999; font-weight:700; cursor:not-allowed;
            ">
              ✓ 已在行程中
            </button>`
          : `<button id="${addId}" style="
              padding:8px 12px; border-radius:10px; border:1px solid #ddd;
              background:white; font-weight:700; cursor:pointer;
            ">
              加入 Trip
            </button>`);



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
              ${addBtnHtml}

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
        infoRef.current!.setOptions({ 
          zIndex: 100, 
          pixelOffset: new google.maps.Size(0, -30) // 視窗位置偏移向上
        });
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

          // 只有在「不在行程中」時，才需要處理 Loading 和點擊事件
          if (addBtn && !isAlreadyInTrip) {
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
        // 5a) 有預覽視窗時：只顯示該地點的畫面
        const offset = 0.005
        map.panTo({  // MAP 平滑滑行
          lat: (preview!.lat as number) + offset,  // 微調圖釘畫面向下
          lng: preview!.lng as number 
        }); 
        map.setZoom(15);
      }

      // 5b) 在沒有預覽視窗 & 第一次call地圖時顯示包含景點池的畫面，邊界 fit bounds
      if (!previewValid && !hasInitialFit.current){
        const pts = valid.map(p => ({ lat: p.lat as number, lng: p.lng as number}));

        if (pts.length > 0){
          const bounds = new google.maps.LatLngBounds();
          pts.forEach(p => bounds.extend(p));
          if (pts.length > 1) {
            // 讓所有景點都進畫面，並留一點邊距 (padding)
            map.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
          } else {
            // 只有一個點時，fitBounds 會縮太近，直接 center 到那一點
            map.setCenter(pts[0]);
            map.setZoom(15);
          }
          hasInitialFit.current = true;
        }
      }
      // 5c) 處理 Polyline 路線連線
      if (!polylineRef.current) {
        polylineRef.current = new google.maps.Polyline({
          strokeOpacity: 0.8,
          strokeWeight: 5, // 線條粗細
          icons: [
            { // 加上箭頭讓方向更清楚
              icon: { 
                path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                fillOpacity: 1,        // 2. 填滿的不透明度，1 代表完全不透明（實心）
                scale: 4,
              },
              offset: "50%",
              repeat: "100px",
            },
          ],
        });
      }

      // 如果當天有超過 2 個景點才畫線
      if (activeDayRoute && activeDayRoute.length > 1) {
        polylineRef.current.setPath(activeDayRoute);
        // 依照當天顏色設定線的顏色，保持視覺一致
        polylineRef.current.setOptions({ strokeColor: colorForDay(activeDay || 1) });
        polylineRef.current.setMap(mapRef.current!);
      } else {
        // 如果少於 2 個景點，或沒傳資料，就把線隱藏
        polylineRef.current.setMap(null);
      }
      
      // 5d) 當天數發生「切換」時，將地圖視野縮放到該天行程的範圍
      if (prevActiveDayRef.current !== activeDay) {
        // 確保這天有景點座標才做事
        if (activeDayRoute && activeDayRoute.length > 0) {
          const bounds = new google.maps.LatLngBounds();
          activeDayRoute.forEach((p) => bounds.extend(p));
          
          if (activeDayRoute.length > 1) {
            // 有兩個點以上：讓所有景點都進畫面，並留一點邊距
            map.fitBounds(bounds, { top: 80, bottom: 80, left: 80, right: 80 });
          } else {
            // 只有一個點：fitBounds 會縮太近，改成直接置中並給定縮放值
            map.setCenter(activeDayRoute[0]);
            map.setZoom(15);
          }
        }
        
        // ★ 非常重要：無論這天有沒有景點，都要更新 Ref，
        // 這樣地圖才不會在其他無關的 Re-render (例如 Hover) 時一直亂跳
        prevActiveDayRef.current = activeDay;
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

      if (polylineRef.current) polylineRef.current.setMap(null);

      infoRef.current?.close();
    };
  }, [valid, schedMap, activeDay, activeDayRoute, preview?.id, previewValid, isAddingPreview, onAddPreview, onClearPreview]);

  return (
    <div
      style={{
        position: "relative",
        height: "100%",
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

      {bottomRight && (
        <div
          style={{
            position: "absolute",
            right: 30,
            top: 20,
            zIndex: 5,
          }}
        >
          {bottomRight}
        </div>
      )}

    </div>
  );
}