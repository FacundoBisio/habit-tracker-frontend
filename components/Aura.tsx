"use client";

import { useEffect } from "react";

/**
 * Fondo animado. El color deriva del avance del día (`pct`, 0–1): arranca en tonos fríos y se
 * va calentando a medida que completás hábitos. Respeta `prefers-reduced-motion` (CSS global).
 */
export function Aura({ pct }: { pct: number }) {
  useEffect(() => {
    document.documentElement.style.setProperty("--p", String(Math.min(1, Math.max(0, pct))));
  }, [pct]);

  return (
    <div className="aura" aria-hidden>
      <i />
      <i />
      <i />
    </div>
  );
}
