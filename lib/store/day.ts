"use client";

import { useMemo } from "react";
import { addDays, weekRange } from "@/lib/domain/dates";
import { isScheduledOn } from "@/lib/domain/schedule";
import { computeStreak } from "@/lib/domain/streaks";
import type { Entry, Habit } from "./db";
import { useEntriesState, useHabitsState, useSettings, useToday } from "./hooks";

/** Estado de un hábito en el día elegido (los campos `today*` son del día seleccionado, no siempre hoy). */
export interface DayRow {
  habit: Habit;
  todayIds: string[];
  todayTotal: number;
  streak: number;
  weekly?: { done: number; target: number };
}

export interface StripDay {
  date: string;
  scheduled: number;
  done: number;
}

const STRIP_DAYS = 14;

/**
 * Resumen del día `selected` (por defecto hoy) por hábito + avance global + los últimos 14 días
 * para la tira de fechas. El aura del fondo usa siempre el avance de hoy.
 */
export function useDaySummary(selected?: string) {
  const { habits, ready: habitsReady } = useHabitsState();
  const { entries, ready: entriesReady } = useEntriesState();
  const settings = useSettings();
  const today = useToday();
  // Un día futuro (o el cambio de día con la app abierta) vuelve a hoy.
  const day = selected && selected <= today ? selected : today;

  return useMemo(() => {
    const { start, end } = weekRange(day, settings.weekStartsOn);
    const byHabit = new Map<string, Entry[]>();
    for (const e of entries) {
      const list = byHabit.get(e.habitId);
      if (list) list.push(e);
      else byHabit.set(e.habitId, [e]);
    }
    const rows: DayRow[] = habits
      .filter((h) => isScheduledOn(h.schedule, day))
      .map((habit) => {
        const mine = byHabit.get(habit.id) ?? [];
        const onDay = mine.filter((e) => e.localDate === day);
        const weekDays = new Set(mine.filter((e) => e.localDate >= start && e.localDate <= end).map((e) => e.localDate));
        return {
          habit,
          todayIds: onDay.map((e) => e.id),
          todayTotal: onDay.reduce((a, e) => a + e.amount, 0),
          streak: day === today ? computeStreak(mine, habit.id, habit.schedule, today, settings.weekStartsOn).current : 0,
          weekly: habit.schedule.type === "weekly" ? { done: weekDays.size, target: habit.schedule.times } : undefined,
        };
      });
    const done = rows.filter((r) => r.todayTotal > 0).length;

    const byDate = new Map<string, Set<string>>();
    for (const e of entries) {
      if (!byDate.has(e.localDate)) byDate.set(e.localDate, new Set());
      byDate.get(e.localDate)!.add(e.habitId);
    }
    const strip: StripDay[] = Array.from({ length: STRIP_DAYS }, (_, i) => {
      const date = addDays(today, i - (STRIP_DAYS - 1));
      const scheduled = habits.filter((h) => isScheduledOn(h.schedule, date));
      const hit = byDate.get(date);
      return { date, scheduled: scheduled.length, done: scheduled.filter((h) => hit?.has(h.id)).length };
    });

    return {
      rows,
      done,
      total: rows.length,
      pct: rows.length ? done / rows.length : 0,
      today,
      day,
      strip,
      hasHabits: habits.length > 0,
      ready: habitsReady && entriesReady,
    };
  }, [habits, entries, settings.weekStartsOn, today, day, habitsReady, entriesReady]);
}
