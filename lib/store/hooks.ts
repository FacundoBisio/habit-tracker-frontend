"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { toLocalDate } from "@/lib/domain/dates";
import { DEFAULT_SETTINGS, db, type Entry, type Goal, type Habit, type Settings } from "./db";

const EMPTY_HABITS: Habit[] = [];
const EMPTY_ENTRIES: Entry[] = [];
const EMPTY_GOALS: Goal[] = [];

export function useSettings(): Settings {
  return useLiveQuery(() => db.settings.get("me"), []) ?? DEFAULT_SETTINGS;
}

export function useHabits(includeArchived = false): Habit[] {
  const all = useLiveQuery(() => db.habits.orderBy("sortOrder").toArray(), []) ?? EMPTY_HABITS;
  return includeArchived ? all : all.filter((h) => !h.archived);
}

export function useEntries(): Entry[] {
  return useLiveQuery(() => db.entries.toArray(), []) ?? EMPTY_ENTRIES;
}

export function useGoals(): Goal[] {
  return useLiveQuery(() => db.goals.toArray(), []) ?? EMPTY_GOALS;
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
