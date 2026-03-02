"use client";

import { useEffect, useMemo, useRef } from "react";
import { loadGoogleMaps } from "@/lib/googleMapsLoader";

type TripPlace = {
  destination_id: number;
  place_name?: string;
  lat?: number | null;
  lng?: number | null;
};

export default function TripMap({ places }: { places: TripPlace[] }) {
  const divRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  const valid = useMemo(
    () => places.filter((p) => typeof p.lat === "number" && typeof p.lng === "number"),
    [places]
  );

  useEffect(() => {
    if (!divRef.current) return;

    let cancelled = false;

    async function boot() {
      const { Map, AdvancedMarkerElement, PinElement } = await loadGoogleMaps();
      if (cancelled) return;

      // 1) init map only once
      if (!mapRef.current) {
        const center =
          valid[0]
            ? { lat: valid[0].lat as number, lng: valid[0].lng as number }
            : { lat: 35.681236, lng: 139.767125 }; // fallback: Tokyo

        mapRef.current = new Map(divRef.current!, {
          center,
          zoom: 12,
          // ✅ 開發期先給 DEMO_MAP_ID，避免 "未使用有效 mapId" 警告
          mapId: process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? "DEMO_MAP_ID",
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
        });
      }

      const map = mapRef.current;

      // 2) clear old markers (important: must have refs)
      for (const m of markersRef.current) m.map = null;
      markersRef.current = [];

      // 3) add markers
      for (let i = 0; i < valid.length; i++) {
        const p = valid[i];

        // ✅ glyphText 取代 glyph；content 直接用 PinElement（不要 pin.element）
        const pin = new PinElement({ glyphText: String(i + 1) });

        const am = new AdvancedMarkerElement({
          map,
          position: { lat: p.lat as number, lng: p.lng as number },
          title: p.place_name ?? `#${p.destination_id}`,
          content: pin,
        });

        // ✅ 必須 push，否則你清不掉 markers
        markersRef.current.push(am);
      }

      // 4) fit bounds
      if (valid.length > 0) {
        const bounds = new google.maps.LatLngBounds();
        for (const p of valid) {
          bounds.extend({ lat: p.lat as number, lng: p.lng as number });
        }
        map.fitBounds(bounds);
      }
    }

    boot();

    return () => {
      cancelled = true;
      // 可選：unmount 時把 markers 清掉
      for (const m of markersRef.current) m.map = null;
      markersRef.current = [];
    };
  }, [valid]);

  return (
    <div
      ref={divRef}
      style={{
        height: "70vh",
        width: "100%",
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #ddd",
      }}
    />
  );
}