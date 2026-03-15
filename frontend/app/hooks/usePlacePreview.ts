import { useState, useRef } from "react";
import { fetchPlacePreview, type PlacePreview } from "@/app/lib/planner/placePreview";

export function usePlacePreview() {
  const [preview, setPreview] = useState<PlacePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewErr, setPreviewErr] = useState<string>("");
  const pickTokenRef = useRef(0);

  // Map Preview 視窗
  const updatePreview = async (placeId: string, displayName?: string) => {
    if (!placeId) return;
    setPreviewErr(""); setPreviewLoading(true); setPreview(null);
    const token = ++pickTokenRef.current;
    try {
    const data = await fetchPlacePreview(placeId);
    if (token !== pickTokenRef.current) return;
    setPreview({ ...data, name: data.name ?? displayName });
    } catch (e: any) {
    if (token !== pickTokenRef.current) return;
    setPreviewErr(e?.message || String(e));
    } finally {
    if (token === pickTokenRef.current) setPreviewLoading(false);
    }
  };

  return {
    preview,
    setPreview,
    previewLoading,
    previewErr,
    updatePreview,
  };

}