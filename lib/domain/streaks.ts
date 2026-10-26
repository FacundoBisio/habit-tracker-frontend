import { addDays, diffDays, startOfWeek, weekday } from "./dates";
import type { DomainEntry, LocalDate, Schedule, WeekStart } from "./types";

export interface StreakResult {
  current: number;
  longest: number;
}

/** Días distintos con registro (amount > 0) del hábito. */
function activeDays(entries: DomainEntry[], habitId: string): Set<LocalDate> {
  const days = new Set<LocalDate>();
  for (const e of entries) {
    if (e.habitId === habitId && e.amount > 0) days.add(e.localDate);
  }
  return days;
}

/**
 * Racha según el schedule.
 * - daily: días consecutivos con registro.
 * - days_of_week: solo cuentan los días programados; los demás se saltean.
 * - weekly{times}: semanas consecutivas con >= times días activos.
 * Hoy sin completar todavía no corta la racha.
 */
export function computeStreak(
  entries: DomainEntry[],
  habitId: string,
  schedule: Schedule,
  today: LocalDate,
  weekStartsOn: WeekStart = 1,
): StreakResult {
  const days = activeDays(entries, habitId);
  if (days.size === 0) return { current: 0, longest: 0 };
  return schedule.type === "weekly"
    ? weeklyStreak(days, schedule.times, today, weekStartsOn)
    : dailyStreak(days, schedule, today);
}

function dailyStreak(days: Set<LocalDate>, schedule: Schedule, today: LocalDate): StreakResult {
  const scheduled = (d: LocalDate) =>
    schedule.type !== "days_of_week" || schedule.days.includes(weekday(d));

  const first = [...days].sort()[0];
  let longest = 0;
  let run = 0;
  for (let d = first; d <= today; d = addDays(d, 1)) {
    if (!scheduled(d)) continue;
    if (days.has(d)) {
      run++;
      longest = Math.max(longest, run);
    } else if (d !== today) {
      run = 0;
    }
  }

  // Racha actual: hacia atrás desde hoy; hoy pendiente no corta.
  let current = 0;
  for (let d = today, i = 0; diffDays(first, d) >= 0; d = addDays(d, -1), i++) {
    if (!scheduled(d)) continue;
    if (days.has(d)) current++;
    else if (i === 0) continue;
    else break;
  }
  return { current, longest };
}

function weeklyStreak(
  days: Set<LocalDate>,
  times: number,
  today: LocalDate,
  weekStartsOn: WeekStart,
): StreakResult {
  const perWeek = new Map<LocalDate, number>();
  for (const d of days) {
    const w = startOfWeek(d, weekStartsOn);
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
  }
  const met = (w: LocalDate) => (perWeek.get(w) ?? 0) >= times;

  const firstWeek = [...perWeek.keys()].sort()[0];
  const thisWeek = startOfWeek(today, weekStartsOn);

  let longest = 0;
  let run = 0;
  for (let w = firstWeek; w <= thisWeek; w = addDays(w, 7)) {
    if (met(w)) {
      run++;
      longest = Math.max(longest, run);
    } else if (w !== thisWeek) {
      run = 0;
    }
  }

  let current = 0;
  for (let w = thisWeek; w >= firstWeek; w = addDays(w, -7)) {
    if (met(w)) current++;
    else if (w === thisWeek) continue;
    else break;
  }
  return { current, longest };
}
