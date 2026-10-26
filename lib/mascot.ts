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

let current: Activity | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

/**
 * El personaje hace `activity` durante `ms` (10 s por defecto) y después vuelve a su estado
 * por defecto. Un toque nuevo reemplaza al anterior y reinicia el tiempo.
 */
export function playActivity(activity: Activity, ms = ACTIVITY_MS) {
  if (timer) clearTimeout(timer);
  current = activity;
  listeners.forEach((l) => l());
  timer = setTimeout(() => {
    current = null;
    timer = null;
    listeners.forEach((l) => l());
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
