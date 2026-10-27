"use client";

import { useEffect, useRef, useState } from "react";
import { ACTIVITY_LABEL, type Activity } from "@/lib/mascot";
import { attachMascot, setTilt, type MascotHandle } from "@/lib/mascot-engine";
import { getMascotStatus, preloadMascot } from "@/lib/mascot-engine-state";

interface Props {
  activity: Activity;
  size: number;
  interactive: boolean;
}

/**
 * Caja del personaje 3D. No crea nada de WebGL: engancha el canvas único del motor (`lib/mascot-engine.ts`),
 * que ya tiene el modelo cargado, y lo muestra recién cuando se dibujó el primer cuadro.
 */
export default function Mascot3D({ activity, size, interactive }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const handle = useRef<MascotHandle | null>(null);
  const activityRef = useRef(activity);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    activityRef.current = activity;
    handle.current?.setActivity(activity);
  }, [activity]);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    let cancelled = false;
    preloadMascot().then(() => {
      if (cancelled || getMascotStatus() === "idle" || getMascotStatus() === "failed") return;
      handle.current = attachMascot(box, { activity: activityRef.current, interactive, onFirstFrame: () => setDrawn(true) });
    });
    return () => {
      cancelled = true;
      handle.current?.detach();
      handle.current = null;
    };
  }, [interactive]);

  return (
    <div
      ref={boxRef}
      role={drawn ? "img" : undefined}
      aria-label={drawn ? ACTIVITY_LABEL[activity] : undefined}
      aria-hidden={drawn ? undefined : true}
      className="absolute inset-0 touch-pan-y"
      style={{
        width: size,
        height: size * 0.875,
        opacity: drawn ? 1 : 0,
        transform: drawn ? "scale(1)" : "scale(0.6)",
        transformOrigin: "50% 85%",
        transition: "opacity 0.25s ease, transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
      onPointerMove={(e) => {
        if (!interactive) return;
        const r = e.currentTarget.getBoundingClientRect();
        setTilt((e.clientX - r.left) / r.width - 0.5, (e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => setTilt(0, 0)}
      onClick={() => {
        if (interactive) handle.current?.poke(); // un solo efecto: el "boing" corto (no cambia la actividad)
      }}
    />
  );
}
