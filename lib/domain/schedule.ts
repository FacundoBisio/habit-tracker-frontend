import { weekday } from "./dates";
import type { LocalDate, Schedule } from "./types";

/** ¿Corresponde mostrar/exigir el hábito ese día? `weekly` aplica todos los días de la semana. */
export function isScheduledOn(schedule: Schedule, date: LocalDate): boolean {
  return schedule.type !== "days_of_week" || schedule.days.includes(weekday(date));
}

export function describeSchedule(schedule: Schedule): string {
  switch (schedule.type) {
    case "daily":
      return "Todos los días";
    case "weekly":
      return `${schedule.times}× por semana`;
    case "days_of_week": {
      const names = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
      return schedule.days.map((d) => names[d]).join(" · ");
    }
  }
}

/**
 * % de cumplimiento en una ventana de días terminando en `today`.
 * Para daily/days_of_week: días programados cumplidos / días programados.
 * Para weekly{times}: días activos / (times por cada 7 días), tope 100.
 */
export function complianceRate(
  schedule: Schedule,
  activeDays: Set<LocalDate>,
  today: LocalDate,
  windowDays: number,
  addDaysFn: (d: LocalDate, n: number) => LocalDate,
): number {
  let done = 0;
  let expected = 0;
  for (let i = 0; i < windowDays; i++) {
    const d = addDaysFn(today, -i);
    if (schedule.type === "weekly") {
      if (activeDays.has(d)) done++;
    } else if (isScheduledOn(schedule, d)) {
      expected++;
      if (activeDays.has(d)) done++;
    }
  }
  if (schedule.type === "weekly") expected = (schedule.times * windowDays) / 7;
  return expected > 0 ? Math.min(100, Math.round((done / expected) * 100)) : 0;
}
