"use client";

import { liveQuery } from "dexie";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { toLocalDate } from "@/lib/domain/dates";
import { DEFAULT_SETTINGS, db, type Entry, type Goal, type Habit, type Settings } from "./db";

const EMPTY_HABITS: Habit[] = [];
const EMPTY_ENTRIES: Entry[] = [];
const EMPTY_GOALS: Goal[] = [];

/*
  Último resultado conocido de cada consulta. Al cambiar de pantalla el componente nuevo arranca
  con estos datos (no con "vacío") y se evita que el contenido salte cuando llega IndexedDB.
  `undefined` = todavía no se cargó nunca (primera carga de la app).
*/
const cache: { habits?: Habit[]; entries?: Entry[]; goals?: Goal[]; settings?: Settings } = {};

export function useSettingsState(): { settings: Settings; ready: boolean } {
  const live = useLiveQuery(async () => (await db.settings.get("me")) ?? DEFAULT_SETTINGS, [], cache.settings);
  useEffect(() => {
    if (live) cache.settings = live;
  }, [live]);
  return { settings: live ?? DEFAULT_SETTINGS, ready: live !== undefined };
}

export const useSettings = (): Settings => useSettingsState().settings;

export function useHabitsState(includeArchived = false): { habits: Habit[]; ready: boolean } {
  const live = useLiveQuery(() => db.habits.orderBy("sortOrder").toArray(), [], cache.habits);
  useEffect(() => {
    if (live) cache.habits = live;
  }, [live]);
  const all = live ?? EMPTY_HABITS;
  // Misma referencia mientras la tabla no cambie: si no, cada render invalidaba los useMemo que dependen de los hábitos.
  const habits = useMemo(() => (includeArchived ? all : all.filter((h) => !h.archived)), [all, includeArchived]);
  return { habits, ready: live !== undefined };
}

export const useHabits = (includeArchived = false): Habit[] => useHabitsState(includeArchived).habits;

/*
  Registros: UNA suscripción compartida por todos los componentes que los usan (Hoy, logros, semana…). Antes cada
  hook leía la tabla entera por su cuenta en cada cambio; ahora es una lectura por cambio para toda la app.
*/
const entryListeners = new Set<() => void>();
let entrySub: { unsubscribe(): void } | null = null;

function subscribeEntries(cb: () => void) {
  entryListeners.add(cb);
  entrySub ??= liveQuery(() => db.entries.toArray()).subscribe({
    next: (rows) => {
      cache.entries = rows;
      entryListeners.forEach((l) => l());
    },
    error: () => {},
  });
  return () => {
    entryListeners.delete(cb);
    if (entryListeners.size === 0) {
      entrySub?.unsubscribe();
      entrySub = null;
    }
  };
}

export function useEntriesState(): { entries: Entry[]; ready: boolean } {
  const live = useSyncExternalStore(subscribeEntries, () => cache.entries, () => undefined);
  return { entries: live ?? EMPTY_ENTRIES, ready: live !== undefined };
}

export const useEntries = (): Entry[] => useEntriesState().entries;

export function useGoals(): Goal[] {
  const live = useLiveQuery(() => db.goals.toArray(), [], cache.goals);
  useEffect(() => {
    if (live) cache.goals = live;
  }, [live]);
  return live ?? EMPTY_GOALS;
}

/** Fecha local de hoy en la zona del usuario; se recalcula al cruzar medianoche o volver a la app. */
export function useToday(): string {
  const { timezone } = useSettings();
  const [today, setToday] = useState(() => toLocalDate(new Date(), timezone));
  useEffect(() => {
    const tick = () => setToday(toLocalDate(new Date(), timezone));
    tick();
    const id = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [timezone]);
  return today;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
