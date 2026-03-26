"use client";

import { useEffect, useRef, useState } from "react";
import {
  HOUR_OPTIONS,
  MINUTE_OPTIONS,
  splitTimeValue,
  joinTimeValue,
  formatTimeLabel,
} from "@/app/lib/edit/itinerary-time";

type TimePopoverProps = {
  label: string;
  value?: string | null;
  onApply: (value: string) => void;
  onClear: () => void;
  compact?: boolean;
};

export default function TimePopover({
  label,
  value,
  onApply,
  onClear,
  compact,
}: TimePopoverProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState("09");
  const [minute, setMinute] = useState("00");

  useEffect(() => {
    if (!open) return;

    const next = splitTimeValue(value);
    setHour(next.hour);
    setMinute(next.minute);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      style={{ position: "relative"}}
      onClick={(e) => e.stopPropagation()}
    >
    <button
    type="button"
    onClick={() => setOpen((v) => !v)}
    style={
      compact
      ? {
          border: "none",
          background: "transparent",
          padding: 0,
          margin: 0,
          cursor: "pointer",
          fontSize: 12,
          color: "#333",
          minWidth: "auto",
          }
      : {
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px",
          borderRadius: 10,
          border: "1px solid #ddd",
          background: "white",
          cursor: "pointer",
          minWidth: 128,
          justifyContent: "space-between",
          }
    }
    >
    {compact ? (
        <span 
          style={{ 
            fontWeight: 700, 
            border: "1px solid #ddd", 
            padding: "5px",
            borderRadius: 10,
          }}
        >
          {formatTimeLabel(value)}</span>
    ) : (
        <>
        <span style={{ fontWeight: 700 }}>{label}</span>
        <span>{formatTimeLabel(value)}</span>
        </>
    )}
    </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            zIndex: 50,
            width: 150,
            border: "1px solid #ddd",
            borderRadius: 12,
            background: "white",
            boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
            padding: 12,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, opacity: 0.75, textAlign: "center" }}>小時</span>
              <select
                value={hour}
                onChange={(e) => setHour(e.target.value)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "white",
                }}
              >
                {HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, opacity: 0.75, textAlign: "center" }}>分鐘</span>
              <select
                value={minute}
                onChange={(e) => setMinute(e.target.value)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "white",
                }}
              >
                {MINUTE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "white",
                cursor: "pointer",
              }}
            >
              清除
            </button>

            <button
              type="button"
              onClick={() => {
                onApply(joinTimeValue(hour, minute));
                setOpen(false);
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "white",
                cursor: "pointer",
              }}
            >
              套用
            </button>
          </div>
        </div>
      )}
    </div>
  );
}