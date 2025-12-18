export type HabitFrequency =
  | { type: "daily" }
  | { type: "weekly"; target: number }; // e.g., 3 times a week

export type HabitCategory = "health" | "work" | "learning" | "spirit" | "other";

export interface Habit {
  id: string;
  name: string;
  frequency: HabitFrequency;
  category?: HabitCategory;
  color?: string;
  icon?: string;
  archived: boolean;
  createdAt: string; // ISO date
}

export interface HabitCheck {
  id: string;
  habitId: string;
  date: string; // YYYY-MM-DD
}
