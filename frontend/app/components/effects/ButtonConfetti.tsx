"use client";

import { useEffect } from "react";
import { burstConfetti } from "@/app/lib/confetti";

const BUTTON_SELECTOR = 'button, [role="button"], input[type="button"], input[type="submit"]';

export default function ButtonConfetti() {
  useEffect(() => {
    let lastBurstAt = 0;

    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const button = target.closest(BUTTON_SELECTOR);
      if (!(button instanceof HTMLElement)) return;
      if (button.hasAttribute("disabled") || button.getAttribute("aria-disabled") === "true") return;

      const now = Date.now();
      if (now - lastBurstAt < 120) return;
      lastBurstAt = now;

      const rect = button.getBoundingClientRect();
      const x = (rect.left + rect.width / 2) / window.innerWidth;
      const y = (rect.top + rect.height / 2) / window.innerHeight;

      void burstConfetti({
        particleCount: 140,
        spread: 90,
        startVelocity: 42,
        ticks: 220,
        origin: {
          x: Math.min(0.95, Math.max(0.05, x)),
          y: Math.min(0.9, Math.max(0.05, y)),
        },
      });
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
}
