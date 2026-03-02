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
      if (!cancelled) setStatus({ kind: "ready" });
    };

    const onErr = (e: any) => {
      if (!cancelled) setStatus({ kind: "error", message: e?.message || "gmp-error" });
    };

    const onSelect = (e: any) => {
      if (cancelled) return;
      const placePrediction = e?.placePrediction ?? e?.detail?.placePrediction;
      const placeId: string | undefined = placePrediction?.placeId;
      if (!placeId) return;

      const main = placePrediction?.mainText?.text;
      const secondary = placePrediction?.secondaryText?.text;
      const label = [main, secondary].filter(Boolean).join(" · ");

      onPick({ placeId, label });

      setResetKey((k) => k + 1);
      setStatus({ kind: "loading" });
    };

    (async () => {
      setStatus({ kind: "loading" });

      // ✅ 一次即可
      await loadPlacesLibrary();
      if (cancelled) return;

      const host = hostRef.current;
      if (!host) return;
      host.innerHTML = "";

      // ✅ 官方建議用 importLibrary 取得 PlaceAutocompleteElement
      const { PlaceAutocompleteElement } = (await (google.maps as any).importLibrary("places")) as any;
      const widget = new PlaceAutocompleteElement({});
      widgetRef.current = widget;

      widget.placeholder = placeholder;
      widget.style.display = "block";
      widget.style.width = "100%";
      widget.style.border = "1px solid #ccc";
      widget.style.borderRadius = "10px";

      widget.addEventListener("gmp-load", onLoad as any);
      widget.addEventListener("gmp-error", onErr as any);
      widget.addEventListener("gmp-select", onSelect as any);

      host.appendChild(widget);
    })().catch((e: any) => {
      console.error(e);
      if (!cancelled) setStatus({ kind: "error", message: e?.message || String(e) });
    });

    return () => {
      cancelled = true;
      cleanup();
    };
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