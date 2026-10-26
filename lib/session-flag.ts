"use client";

import { useCallback, useSyncExternalStore } from "react";

// Respaldo en memoria por si sessionStorage está bloqueado (modo privado, políticas del navegador).
const memory = new Set<string>();
const listeners = new Set<() => void>();

function read(key: string): boolean {
  if (memory.has(key)) return true;
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

/**
 * Bandera por sesión del navegador (se pierde al cerrar la pestaña), sin setState en efectos y
 * segura para SSR: en el servidor devuelve `serverValue`.
 */
export function useSessionFlag(key: string, serverValue = false): [boolean, () => void] {
  const value = useSyncExternalStore(subscribe, () => read(key), () => serverValue);
  const set = useCallback(() => {
    memory.add(key);
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* se conserva solo en memoria */
    }
    listeners.forEach((l) => l());
  }, [key]);
  return [value, set];
}
