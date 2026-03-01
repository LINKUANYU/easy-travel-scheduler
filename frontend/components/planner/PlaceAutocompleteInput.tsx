"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadPlacesLibrary } from "@/lib/googleMapsLoader";

type Pick = { placeId: string; label?: string };

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
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [resetKey, setResetKey] = useState(0);

  const isReady = status.kind === "ready";
  const isDisabled = !!disabled || !isReady;

  const hint = useMemo(() => {
    if (status.kind === "loading") return "Loading Google Places…";
    if (status.kind === "error") return "Google Places 載入失敗（請看下方訊息）";
    return "";
  }, [status.kind]);

  useEffect(() => {
    let cancelled = false;

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

    const onLoad = () => {
      if (cancelled) return;
      setStatus({ kind: "ready" });
    };

    const onErr = (e: any) => {
      if (cancelled) return;
      // gmp-error：通常是 key / API / referrer 限制問題:contentReference[oaicite:1]{index=1}
      setStatus({ kind: "error", message: e?.message || "gmp-error (request denied)" });
    };

    const onSelect = (e: any) => {
      if (cancelled) return;

      // 事件型別：PlacePredictionSelectEvent，選到的 prediction 在 event.placePrediction:contentReference[oaicite:2]{index=2}
      const placePrediction = e?.placePrediction ?? e?.detail?.placePrediction;
      const placeId: string | undefined = placePrediction?.placeId; // PlacePrediction.placeId:contentReference[oaicite:3]{index=3}
      if (!placeId) return;

      const main = placePrediction?.mainText?.text; // FormattableText.text:contentReference[oaicite:4]{index=4}
      const secondary = placePrediction?.secondaryText?.text;
      const label = [main, secondary].filter(Boolean).join(" · ");

      onPick({ placeId, label });

      // 清空輸入：官方沒有提供「set value=''」的穩定 API，
      // 最穩的做法是重新建立 widget（很輕量）
      setResetKey((k) => k + 1);
      setStatus({ kind: "loading" });
    };

    (async () => {
      setStatus({ kind: "loading" });
      await loadPlacesLibrary();
      if (cancelled) return;

      const host = hostRef.current;
      if (!host) return;

      host.innerHTML = "";

      // 建立 PlaceAutocompleteElement（Autocomplete New 的 widget）:contentReference[oaicite:5]{index=5}
      // ✅ 先確保 places library 已載入（你原本的 loadPlacesLibrary 仍可保留）
      await loadPlacesLibrary();

      // ✅ 用官方方式取出 PlaceAutocompleteElement（TS 用 any 解決型別問題）
      const { PlaceAutocompleteElement } = (await (google.maps as any).importLibrary("places")) as any;

      if (!PlaceAutocompleteElement) {
      throw new Error("PlaceAutocompleteElement not found. Is Places library loaded?");
      }

      const widget = new PlaceAutocompleteElement({});
      widgetRef.current = widget;

      // placeholder：官方支援 placeholder 屬性:contentReference[oaicite:6]{index=6}
      widget.placeholder = isReady ? placeholder : placeholder;

      // 基本外觀（你也可以用 CSS variables 進一步調整）
      widget.style.display = "block";
      widget.style.width = "100%";
      widget.style.border = "1px solid #ccc";
      widget.style.borderRadius = "10px";

      // 綁事件：gmp-load / gmp-error / gmp-select:contentReference[oaicite:7]{index=7}
      widget.addEventListener("gmp-load", onLoad as any);
      widget.addEventListener("gmp-error", onErr as any);
      widget.addEventListener("gmp-select", onSelect as any);

      host.appendChild(widget);
      // 注意：ready 會在 gmp-load 後才設為 ready
    })().catch((e: any) => {
      console.error(e);
      if (!cancelled) setStatus({ kind: "error", message: e?.message || String(e) });
    });

    return () => {
      cancelled = true;
      cleanup();
    };
    // resetKey 變動就重建 widget（用來清空）
  }, [resetKey, placeholder, onPick]);

  // disabled 狀態：用 pointer-events/opacity 控制（widget 本身不一定有 disabled API）
  useEffect(() => {
    const el = widgetRef.current;
    if (!el) return;
    el.style.pointerEvents = isDisabled ? "none" : "auto";
    el.style.opacity = isDisabled ? "0.7" : "1";
  }, [isDisabled]);

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div ref={hostRef} />

      {status.kind !== "ready" && (
        <div style={{ fontSize: 13, opacity: 0.75 }}>{hint}</div>
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