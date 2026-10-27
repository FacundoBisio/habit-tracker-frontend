"use client";

import { useSyncExternalStore } from "react";
import { iconKey } from "@/lib/habit-icons";

export type Activity =
  | "idle"
  | "wave"
  | "lift"
  | "drink"
  | "read"
  | "meditate"
  | "run"
  | "sleep"
  | "dance"
  | "celebrate";

/** Qué hace el personaje según el ícono del hábito que se tocó. */
export function activityFor(habitIcon: string | undefined): Activity {
  switch (iconKey(habitIcon)) {
    case "dumbbell":
      return "lift";
    case "droplets":
    case "coffee":
    case "apple":
    case "pill":
      return "drink";
    case "book-open":
    case "pen-line":
    case "code":
      return "read";
    case "brain":
    case "leaf":
      return "meditate";
    case "footprints":
    case "bike":
      return "run";
    case "moon":
      return "sleep";
    case "music":
      return "dance";
    case "heart":
      return "celebrate";
    default:
      return "wave";
  }
}

/** Cuánto dura una actividad disparada por un toque. */
export const ACTIVITY_MS = 10_000;

/** Tope de la espera para terminar el gesto en curso (un ciclo de la actividad más larga, con margen). */
export const MAX_EXIT_WAIT_MS = 5_000;

let current: Activity | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
let exitDelay: ((activity: Activity) => number) | null = null;

/**
 * Quién sabe cuánto le falta al gesto en curso para terminar bien (ms): lo registra el motor 3D, que conoce la fase
 * de la animación. Sin nadie registrado (2D, tests) la actividad termina justo a tiempo.
 */
export function setActivityExitDelay(fn: ((activity: Activity) => number) | null) {
  exitDelay = fn;
}

/**
 * El personaje hace `activity` durante `ms` (10 s por defecto) y después vuelve a su estado
 * por defecto. Un toque nuevo reemplaza al anterior y reinicia el tiempo. Al vencer, si el gesto
 * quedó a la mitad (el vaso subiendo, la mancuerna arriba) espera al próximo punto de salida natural
 * (como mucho `MAX_EXIT_WAIT_MS`).
 */
export function playActivity(activity: Activity, ms = ACTIVITY_MS) {
  if (timer) clearTimeout(timer);
  current = activity;
  listeners.forEach((l) => l());
  const finish = () => {
    current = null;
    timer = null;
    listeners.forEach((l) => l());
  };
  timer = setTimeout(() => {
    const extra = Math.min(MAX_EXIT_WAIT_MS, Math.max(0, exitDelay?.(activity) || 0));
    if (extra > 0) timer = setTimeout(finish, extra);
    else finish();
  }, ms);
}

export const getActivityOverride = () => current;

/** Solo para tests. */
export function resetActivity() {
  if (timer) clearTimeout(timer);
  timer = null;
  current = null;
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/** Actividad pedida por el último toque (o null si ya pasaron los 10 s). */
export function useActivityOverride(): Activity | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** Texto accesible de lo que hace el personaje (lo usan el 2D y el 3D). */
export const ACTIVITY_LABEL: Record<Activity, string> = {
  idle: "El personaje te acompaña",
  wave: "El personaje te saluda",
  lift: "El personaje levanta pesas",
  drink: "El personaje toma agua",
  read: "El personaje lee",
  meditate: "El personaje medita",
  run: "El personaje corre",
  sleep: "El personaje duerme",
  dance: "El personaje baila",
  celebrate: "El personaje festeja",
};
