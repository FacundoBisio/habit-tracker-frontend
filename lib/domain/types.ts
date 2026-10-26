/** Fecha local del usuario en formato YYYY-MM-DD. */
export type LocalDate = string;

export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Schedule =
  | { type: "daily" }
  | { type: "weekly"; times: number }
  | { type: "days_of_week"; days: number[] }; // 0 = domingo … 6 = sábado

export interface DomainEntry {
  habitId: string;
  localDate: LocalDate;
  amount: number;
}

export interface DomainHabit {
  id: string;
  schedule: Schedule;
}

export type GoalKind = "count" | "sum" | "streak" | "frequency";

export interface DomainGoal {
  kind: GoalKind;
  targetValue: number;
  periodStart: LocalDate;
  periodEnd: LocalDate;
}

export interface GoalLink {
  habitId: string;
  weight: number;
}
