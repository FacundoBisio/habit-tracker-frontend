import { isScheduledOn } from "./schedule";
import { computeStreak } from "./streaks";
import type { DomainEntry, LocalDate, Schedule, WeekStart } from "./types";

export type AchievementGroup = "rachas" | "constancia" | "registros" | "dias" | "objetivos";
export type AchievementIcon = "flame" | "calendar-check" | "check-check" | "sparkles" | "trophy" | "flag" | "crown" | "medal";

export interface Achievement {
  id: string;
  group: AchievementGroup;
  title: string;
  description: string;
  icon: AchievementIcon;
  /** Meta numérica y avance actual (acotado a la meta). */
  target: number;
  value: number;
  unlocked: boolean;
}

export interface AchievementInput {
  habits: { id: string; schedule: Schedule }[];
  entries: DomainEntry[];
  goals: { status: string }[];
  today: LocalDate;
  weekStartsOn: WeekStart;
}

export const GROUP_LABEL: Record<AchievementGroup, string> = {
  rachas: "Rachas",
  constancia: "Constancia semanal",
  registros: "Registros",
  dias: "Días perfectos",
  objetivos: "Objetivos",
};

interface Tier {
  n: number;
  title: string;
  icon: AchievementIcon;
}

const STREAK_TIERS: Tier[] = [
  { n: 3, title: "Arrancando", icon: "flame" },
  { n: 7, title: "Una semana entera", icon: "flame" },
  { n: 14, title: "Dos semanas", icon: "flame" },
  { n: 30, title: "Un mes de constancia", icon: "medal" },
  { n: 60, title: "Dos meses", icon: "medal" },
  { n: 100, title: "Cien días", icon: "crown" },
  { n: 365, title: "Un año", icon: "crown" },
];

const WEEKLY_TIERS: Tier[] = [
  { n: 2, title: "Dos semanas al hilo", icon: "calendar-check" },
  { n: 4, title: "Un mes semanal", icon: "calendar-check" },
  { n: 8, title: "Ocho semanas", icon: "medal" },
  { n: 12, title: "Un trimestre", icon: "crown" },
];

const ENTRY_TIERS: Tier[] = [
  { n: 1, title: "Primer registro", icon: "flag" },
  { n: 10, title: "Diez registros", icon: "check-check" },
  { n: 50, title: "Cincuenta registros", icon: "check-check" },
  { n: 100, title: "Cien registros", icon: "check-check" },
  { n: 250, title: "Doscientos cincuenta", icon: "medal" },
  { n: 500, title: "Quinientos registros", icon: "medal" },
  { n: 1000, title: "Mil registros", icon: "crown" },
];

const PERFECT_TIERS: Tier[] = [
  { n: 1, title: "Día redondo", icon: "sparkles" },
  { n: 7, title: "Siete días redondos", icon: "sparkles" },
  { n: 30, title: "Treinta días redondos", icon: "medal" },
  { n: 100, title: "Cien días redondos", icon: "crown" },
];

const GOAL_TIERS: Tier[] = [
  { n: 1, title: "Primer objetivo", icon: "trophy" },
  { n: 3, title: "Tres objetivos", icon: "trophy" },
  { n: 10, title: "Diez objetivos", icon: "crown" },
];

/**
 * Días en que se cumplieron TODOS los hábitos programados (los semanales no cuentan: no tienen
 * un día fijo). Un hábito "existe" desde su primer registro, para no penalizar días anteriores.
 */
export function countPerfectDays(habits: AchievementInput["habits"], entries: DomainEntry[], today: LocalDate): number {
  const daily = habits.filter((h) => h.schedule.type !== "weekly");
  if (!daily.length) return 0;

  const first = new Map<string, LocalDate>();
  const byDate = new Map<LocalDate, Set<string>>();
  for (const e of entries) {
    if (e.amount <= 0 || e.localDate > today) continue;
    if (!first.has(e.habitId) || e.localDate < first.get(e.habitId)!) first.set(e.habitId, e.localDate);
    if (!byDate.has(e.localDate)) byDate.set(e.localDate, new Set());
    byDate.get(e.localDate)!.add(e.habitId);
  }

  let perfect = 0;
  for (const [date, done] of byDate) {
    const due = daily.filter((h) => first.has(h.id) && first.get(h.id)! <= date && isScheduledOn(h.schedule, date));
    if (due.length > 0 && due.every((h) => done.has(h.id))) perfect++;
  }
  return perfect;
}

function build(group: AchievementGroup, tiers: Tier[], value: number, describe: (n: number) => string): Achievement[] {
  return tiers.map((t) => ({
    id: `${group}-${t.n}`,
    group,
    title: t.title,
    description: describe(t.n),
    icon: t.icon,
    target: t.n,
    value: Math.min(value, t.n),
    unlocked: value >= t.n,
  }));
}

/** Logros calculados siempre desde los registros (nada se guarda salvo cuáles ya se avisaron). */
export function computeAchievements(input: AchievementInput): Achievement[] {
  const { habits, entries, goals, today, weekStartsOn } = input;

  let bestDays = 0;
  let bestWeeks = 0;
  for (const h of habits) {
    const longest = computeStreak(entries, h.id, h.schedule, today, weekStartsOn).longest;
    if (h.schedule.type === "weekly") bestWeeks = Math.max(bestWeeks, longest);
    else bestDays = Math.max(bestDays, longest);
  }

  const totalEntries = entries.filter((e) => e.amount > 0).length;
  const completedGoals = goals.filter((g) => g.status === "completed").length;

  return [
    ...build("rachas", STREAK_TIERS, bestDays, (n) => `Mantené un hábito ${n} días seguidos`),
    ...build("constancia", WEEKLY_TIERS, bestWeeks, (n) => `Cumplí la meta semanal de un hábito ${n} semanas seguidas`),
    ...build("registros", ENTRY_TIERS, totalEntries, (n) => (n === 1 ? "Hacé tu primer registro" : `Sumá ${n} registros en total`)),
    ...build("dias", PERFECT_TIERS, countPerfectDays(habits, entries, today), (n) =>
      n === 1 ? "Completá todos los hábitos de un día" : `Completá todos los hábitos de ${n} días`,
    ),
    ...build("objetivos", GOAL_TIERS, completedGoals, (n) => (n === 1 ? "Completá un objetivo" : `Completá ${n} objetivos`)),
  ];
}
