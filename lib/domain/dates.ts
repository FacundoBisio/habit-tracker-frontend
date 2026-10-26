import { formatInTimeZone } from "date-fns-tz";
import type { LocalDate, WeekStart } from "./types";

const DAY_MS = 86_400_000;

function toUtcMs(date: LocalDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Día calendario de un instante en la zona horaria del usuario. */
export function toLocalDate(instant: Date, timeZone: string): LocalDate {
  return formatInTimeZone(instant, timeZone, "yyyy-MM-dd");
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

export function diffDays(from: LocalDate, to: LocalDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** 0 = domingo … 6 = sábado. */
export function weekday(date: LocalDate): number {
  return new Date(toUtcMs(date)).getUTCDay();
}

export function startOfWeek(date: LocalDate, weekStartsOn: WeekStart): LocalDate {
  const back = (weekday(date) - weekStartsOn + 7) % 7;
  return addDays(date, -back);
}

export function weekRange(
  date: LocalDate,
  weekStartsOn: WeekStart,
): { start: LocalDate; end: LocalDate } {
  const start = startOfWeek(date, weekStartsOn);
  return { start, end: addDays(start, 6) };
}

export function isBetween(date: LocalDate, start: LocalDate, end: LocalDate): boolean {
  return date >= start && date <= end;
}
