import type { DomainEntry, LocalDate, Schedule, WeekStart } from "./types";

export interface StreakResult {
  current: number;
  longest: number;
}

const DAY_MS = 86_400_000;

/**
 * Las fechas se pasan una sola vez a "número de día" (días desde 1970-01-01) y los recorridos
 * usan enteros: con años de historial, convertir texto ↔ fecha en cada paso era lo más caro.
 */
const dayNum = (date: LocalDate): number => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / DAY_MS;
/** 0 = domingo … 6 = sábado (el 1970-01-01 fue jueves). */
const weekdayOf = (n: number): number => (((n + 4) % 7) + 7) % 7;

/** Días distintos con registro (amount > 0) del hábito. */
function activeDays(entries: DomainEntry[], habitId: string): Set<number> {
  const seen = new Set<LocalDate>();
  const days = new Set<number>();
  for (const e of entries) {
    if (e.habitId !== habitId || e.amount <= 0 || seen.has(e.localDate)) continue;
    seen.add(e.localDate);
    days.add(dayNum(e.localDate));
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
    ? weeklyStreak(days, schedule.times, dayNum(today), weekStartsOn)
    : dailyStreak(days, schedule, dayNum(today));
}

function dailyStreak(days: Set<number>, schedule: Schedule, today: number): StreakResult {
  const scheduled = (d: number) => schedule.type !== "days_of_week" || schedule.days.includes(weekdayOf(d));

  let first = Infinity;
  for (const d of days) if (d < first) first = d;
  let longest = 0;
  let run = 0;
  for (let d = first; d <= today; d++) {
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
  for (let d = today; d >= first; d--) {
    if (!scheduled(d)) continue;
    if (days.has(d)) current++;
    else if (d === today) continue;
    else break;
  }
  return { current, longest };
}

function weeklyStreak(days: Set<number>, times: number, today: number, weekStartsOn: WeekStart): StreakResult {
  const weekOf = (d: number) => d - ((weekdayOf(d) - weekStartsOn + 7) % 7);
  const perWeek = new Map<number, number>();
  for (const d of days) {
    const w = weekOf(d);
    perWeek.set(w, (perWeek.get(w) ?? 0) + 1);
  }
  const met = (w: number) => (perWeek.get(w) ?? 0) >= times;

  let firstWeek = Infinity;
  for (const w of perWeek.keys()) if (w < firstWeek) firstWeek = w;
  const thisWeek = weekOf(today);

  let longest = 0;
  let run = 0;
  for (let w = firstWeek; w <= thisWeek; w += 7) {
    if (met(w)) {
      run++;
      longest = Math.max(longest, run);
    } else if (w !== thisWeek) {
      run = 0;
    }
  }

  let current = 0;
  for (let w = thisWeek; w >= firstWeek; w -= 7) {
    if (met(w)) current++;
    else if (w === thisWeek) continue;
    else break;
  }
  return { current, longest };
}

