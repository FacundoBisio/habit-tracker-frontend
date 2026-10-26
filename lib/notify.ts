"use client";

import { useSyncExternalStore } from "react";

export interface NoticeAction {
  label: string;
  onClick: () => void;
}
export interface Notice {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
  duration: number;
  action?: NoticeAction;
  /** Clave de ícono de hábito para mostrar en el aviso. */
  icon?: string;
}
interface Options {
  duration?: number;
  action?: NoticeAction;
  icon?: string;
}

export interface NoticeState {
  /** Aviso visible ahora (uno solo: el resto espera en cola). */
  current: Notice | null;
  /** Cuántos avisos esperan su turno. */
  waiting: number;
}

const QUEUE_MAX = 6;
/** Si hay avisos esperando, el actual se acorta a este tiempo para que la cola avance. */
export const FAST_MS = 1800;

let current: Notice | null = null;
let queue: Notice[] = [];
let shownAt = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
let snapshot: NoticeState = { current: null, waiting: 0 };
const listeners = new Set<() => void>();

function emit() {
  snapshot = { current, waiting: queue.length };
  listeners.forEach((l) => l());
}

function show(n: Notice) {
  current = n;
  shownAt = Date.now();
  const ms = queue.length > 0 ? Math.min(n.duration, FAST_MS) : n.duration;
  timer = setTimeout(() => dismiss(n.id), ms);
  emit();
}

export function dismiss(id: number) {
  if (current?.id === id) {
    if (timer) clearTimeout(timer);
    timer = null;
    current = null;
    const next = queue.shift();
    if (next) show(next);
    else emit();
    return;
  }
  queue = queue.filter((n) => n.id !== id);
  emit();
}

function push(kind: Notice["kind"], text: string, opts: Options = {}) {
  const id = ++seq;
  const n: Notice = {
    id,
    kind,
    text,
    duration: opts.duration ?? (kind === "error" ? 6000 : 4500),
    action: opts.action,
    icon: opts.icon,
  };
  if (!current) {
    show(n);
    return id;
  }
  queue.push(n);
  if (queue.length > QUEUE_MAX) queue.shift();
  // Llegó alguien más: el aviso actual cede su lugar antes de lo previsto.
  if (timer && current.duration - (Date.now() - shownAt) > FAST_MS) {
    clearTimeout(timer);
    const cur = current;
    timer = setTimeout(() => dismiss(cur.id), FAST_MS);
  }
  emit();
  return id;
}

/**
 * Notificaciones en el espacio reservado de la barra superior. Van en cola, de a una:
 * así nunca empujan ni tapan el contenido. Misma forma que `toast` de sonner.
 */
export const toast = Object.assign((text: string, opts?: Options) => push("info", text, opts), {
  success: (text: string, opts?: Options) => push("success", text, opts),
  error: (text: string, opts?: Options) => push("error", text, opts),
  dismiss,
});

export const getNoticeState = () => snapshot;

/** Solo para tests. */
export function resetNotices() {
  if (timer) clearTimeout(timer);
  timer = null;
  current = null;
  queue = [];
  emit();
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const SERVER_STATE: NoticeState = { current: null, waiting: 0 };

export function useNoticeState(): NoticeState {
  return useSyncExternalStore(subscribe, () => snapshot, () => SERVER_STATE);
}
