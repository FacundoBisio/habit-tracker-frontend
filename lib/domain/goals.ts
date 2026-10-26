import { diffDays, isBetween, startOfWeek } from "./dates";
import type { DomainEntry, DomainGoal, GoalLink, LocalDate, WeekStart } from "./types";

export interface GoalProgress {
  current: number;
  target: number;
  /** 0–100, tope en 100. */
  pct: number;
  completed: boolean;
  /** Valor esperado hoy si el ritmo fuera lineal. */
  expected: number;
  /** current - expected: negativo = atrasado. */
  delta: number;
  daysLeft: number;
}

function weightOf(links: GoalLink[], habitId: string): number | undefined {
  return links.find((l) => l.habitId === habitId)?.weight;
}

/** Entradas vinculadas al objetivo dentro del período, con su peso. */
function linked(goal: DomainGoal, links: GoalLink[], entries: DomainEntry[]) {
  const out: { localDate: LocalDate; amount: number; weight: number }[] = [];
  for (const e of entries) {
    const weight = weightOf(links, e.habitId);
    if (weight === undefined || e.amount <= 0) continue;
    if (!isBetween(e.localDate, goal.periodStart, goal.periodEnd)) continue;
    out.push({ localDate: e.localDate, amount: e.amount, weight });
  }
  return out;
}

/** Cantidad de semanas (inicio de semana distinto) que toca el período. */
export function weeksInPeriod(goal: DomainGoal, weekStartsOn: WeekStart): number {
  const first = startOfWeek(goal.periodStart, weekStartsOn);
  const last = startOfWeek(goal.periodEnd, weekStartsOn);
  return diffDays(first, last) / 7 + 1;
}

/**
 * Progreso calculado siempre desde `entries` (nunca un contador mutable).
 * - count: cantidad de registros ponderados.
 * - sum: suma de cantidades ponderadas.
 * - frequency: semanas del período con >= targetValue días activos; la meta son las semanas del período.
 * - streak: racha diaria más larga dentro del período; la meta es targetValue días.
 */
export function computeGoalProgress(
  goal: DomainGoal,
  links: GoalLink[],
  entries: DomainEntry[],
  today: LocalDate,
  weekStartsOn: WeekStart = 1,
): GoalProgress {
  const rows = linked(goal, links, entries);
  let current = 0;
  let target = goal.targetValue;

  switch (goal.kind) {
    case "count":
      current = rows.reduce((acc, r) => acc + r.weight, 0);
      break;
    case "sum":
      current = rows.reduce((acc, r) => acc + r.amount * r.weight, 0);
      break;
    case "frequency": {
      const perWeek = new Map<LocalDate, Set<LocalDate>>();
      for (const r of rows) {
        const w = startOfWeek(r.localDate, weekStartsOn);
        if (!perWeek.has(w)) perWeek.set(w, new Set());
        perWeek.get(w)!.add(r.localDate);
      }
      current = [...perWeek.values()].filter((s) => s.size >= goal.targetValue).length;
      target = weeksInPeriod(goal, weekStartsOn);
      break;
    }
    case "streak": {
      const days = [...new Set(rows.map((r) => r.localDate))].sort();
      let run = 0;
      for (let i = 0; i < days.length; i++) {
        run = i > 0 && diffDays(days[i - 1], days[i]) === 1 ? run + 1 : 1;
        current = Math.max(current, run);
      }
      break;
    }
  }

  const totalDays = diffDays(goal.periodStart, goal.periodEnd) + 1;
  const elapsed = Math.min(Math.max(diffDays(goal.periodStart, today) + 1, 0), totalDays);
  const expected = (target * elapsed) / totalDays;
  const daysLeft = Math.max(diffDays(today, goal.periodEnd), 0);

  return {
    current,
    target,
    pct: target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0,
    completed: target > 0 && current >= target,
    expected,
    delta: current - expected,
    daysLeft,
  };
}
