"use client";

import { useSyncExternalStore } from "react";
import { readMascotMode, webglSupported } from "./mascot-3d";

/**
 * Estado del motor 3D del personaje, sin importar three.js (este módulo entra en el paquete inicial).
 * El motor en sí (`lib/mascot-engine.ts`) se descarga solo cuando se necesita.
 *
 * - idle: todavía no se pidió. loading: descargando/parseando. ready: modelo listo para dibujar.
 * - lost: el navegador soltó el contexto WebGL (iOS lo hace en segundo plano); vuelve solo si se restaura.
 * - failed: no se pudo (sin WebGL, modelo roto, equipo lento): se usa la bola 2D.
 */
export type MascotStatus = "idle" | "loading" | "ready" | "lost" | "failed";

/** Cuánto se espera al 3D antes de resignarse a la bola 2D en esa pantalla. */
export const MASCOT_TIMEOUT_MS = 4000;

let status: MascotStatus = "idle";
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setMascotStatus(next: MascotStatus) {
  if (status === next) return;
  status = next;
  emit();
}
export const getMascotStatus = () => status;
export const isMascotReady = () => status === "ready";

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

export const useMascotStatus = (): MascotStatus => useSyncExternalStore(subscribe, getMascotStatus, () => "idle");

/** ¿El dispositivo y el usuario permiten el 3D? (preferencia, WebGL 2 y "menos movimiento"). */
export function mascot3dAllowed(): boolean {
  if (typeof window === "undefined") return false;
  return readMascotMode() === "3d" && webglSupported() && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Descarga y prepara el motor (three.js + modelo + shaders compilados). Idempotente: todas las llamadas
 * comparten la misma promesa, así que el modelo se baja y se parsea una sola vez por sesión.
 */
export function preloadMascot(): Promise<void> {
  if (loading) return loading;
  if (!mascot3dAllowed()) return Promise.resolve();
  setMascotStatus("loading");
  performance.mark("mascot:init");
  loading = import("./mascot-engine")
    .then((m) => m.loadEngine())
    .catch(() => setMascotStatus("failed"));
  return loading;
}

/** Contadores para diagnóstico y pruebas: cuántos renderers se crearon y cuántas veces se bajó el modelo. */
export interface MascotStats {
  renderers: number;
  loads: number;
}
export function mascotStats(): MascotStats {
  const w = window as unknown as { __mascotStats?: MascotStats };
  return (w.__mascotStats ??= { renderers: 0, loads: 0 });
}
