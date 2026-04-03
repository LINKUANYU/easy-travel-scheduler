"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadPlacesLibrary } from "@/app/lib/googleMapsLoader";

type Pick = { placeId: string; label?: string };

// 自定義狀態
type Status =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export default function PlaceAutocompleteInput({
  onPick,
  disabled,
  placeholder = "搜尋並選擇地點（Google Places）",
}: {
  onPick: (p: Pick) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);  // 放實體input的DOM
  const widgetRef = useRef<any>(null);  // 放實體input
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [resetKey, setResetKey] = useState(0);

  const isReady = status.kind === "ready";
  const isDisabled = !!disabled || !isReady;

  const hint = useMemo(() => {
    if (status.kind === "loading") return "Loading Google Places…";
    if (status.kind === "error") return "Google Places 載入失敗（請看下方訊息）";
    return "";
  }, [status.kind]);

  // 把onPick函式 用ref存起來，useRef：改變ref.current不觸發re-render
  const onPickRef = useRef(onPick);
  // 在父層每次re-render後都會重新建立onPick的函式，每當onPick更新就更新onPickRef
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  // 建立搜尋 input
  useEffect(() => {
    let cancelled = false;

    // 清空所有東西
    const cleanup = () => {
      const el = widgetRef.current;
      if (el) {
        el.removeEventListener("gmp-load", onLoad as any);
        el.removeEventListener("gmp-error", onErr as any);
        el.removeEventListener("gmp-select", onSelect as any);
      }
      widgetRef.current = null;
      if (hostRef.current) hostRef.current.innerHTML = "";
    };

    // 為了配合搜尋input的事件執行的方程式：搜尋input 準備好的時候執行
    const onLoad = () => {  
      if (!cancelled) setStatus({ kind: "ready" });  // 把狀態變成"ready"
    };
    // 為了配合搜尋input的事件執行的方程式：搜尋input 有錯誤的時候執行
    const onErr = (e: any) => {
      if (!cancelled) setStatus({ kind: "error", message: e?.message || "gmp-error" });
      // 把狀態變成"error"
    };
    // 為了配合搜尋input的事件執行的方程式：搜尋input 選到地點的時候執行
    const onSelect = (e: any) => {
      if (cancelled) return;
      // 從 api 拿到的資料
      const placePrediction = e?.placePrediction ?? e?.detail?.placePrediction;
      const placeId: string | undefined = placePrediction?.placeId;  // google_place_id
      if (!placeId) return;

      const main = placePrediction?.mainText?.text;  // 地點名稱
      const secondary = placePrediction?.secondaryText?.text;  // 副標題
      const label = [main, secondary].filter(Boolean).join(" · ");

      onPickRef.current({ placeId, label });  // 回給父層

      setResetKey((k) => k + 1);  // 讓Effect 重跑，Reset 整個搜尋input
      setStatus({ kind: "loading" });
    };

    (async () => {
      setStatus({ kind: "loading" });

      // 一次即可，確保「最外層」的 Google Maps 載入腳本（Loader）已經成功把 JS 檔案抓到你的瀏覽器裡。
      await loadPlacesLibrary();
      if (cancelled) return;

      const host = hostRef.current;
      if (!host) return;
      host.innerHTML = "";

      // ✅ 官方建議用 importLibrary 取得 PlaceAutocompleteElement
      const { PlaceAutocompleteElement } = (await (google.maps as any).importLibrary("places")) as any;
      const widget = new PlaceAutocompleteElement({});  // 建立實體搜尋input
      widgetRef.current = widget;

      widget.placeholder = placeholder;
      widget.style.display = "block";
      widget.style.width = "100%";
      widget.style.border = "1px solid #ccc";
      widget.style.borderRadius = "10px";

      // google 原生事件 gmp-load (載入成功事件)：外部腳本下載完成，且這個特殊的 HTML 元素（PlaceAutocompleteElement）在你的瀏覽器中成功渲染並準備好接受輸入時。
      widget.addEventListener("gmp-load", onLoad as any);
      // google 原生事件 gmp-error (載入失敗事件)
      widget.addEventListener("gmp-error", onErr as any);
      // google 原生事件 gmp-select (選取地點事件)
      widget.addEventListener("gmp-select", onSelect as any);

      host.appendChild(widget);  // 掛進div內
      // 讓狀態變成"ready"
      if (!cancelled) {
        setStatus({ kind: "ready" });
      }
    })().catch((e: any) => {
      console.error(e);
      if (!cancelled) setStatus({ kind: "error", message: e?.message || String(e) });
    });

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [resetKey, placeholder]);

  // Google 的 Web Component 原生元件有時候不聽 React 的話（不支援標準的 disabled 屬性），所以我們直接用 CSS 從外部「封鎖」它。
  useEffect(() => {
    const el = widgetRef.current;
    if (!el) return;
    el.style.pointerEvents = isDisabled ? "none" : "auto";
    el.style.opacity = isDisabled ? "0.7" : "1";
  }, [isDisabled]);

  return (
    <div style={{ display: "grid", gap: 6 }}>
      {/* 14px 改成 16px，維持最佳體驗並防止 iOS 自動放大 */}
      <div ref={hostRef} className="text-[16px] md:text-base" />

      {status.kind !== "ready" && (
        <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
          {hint}
        </div>
      )}

      {status.kind === "error" && (
        <div style={{ fontSize: 13, color: "crimson" }}>
          {status.message}
          <div style={{ marginTop: 4, opacity: 0.85 }}>
            常見原因：API key 沒設、未啟用 Places API / Maps JavaScript API、或 key 的 referrer 限制擋住 localhost。
          </div>
        </div>
      )}
    </div>
  );
}