export type HabitFrequency = "daily" | "weekly" | "custom";

export interface Habit {
  id: string;
  name: string;
  frequency: HabitFrequency;
  color?: string;
  icon?: string;
  createdAt: string; // ISO date
}

export interface HabitCheck {
  id: string;
  habitId: string;
  date: string; // YYYY-MM-DD
}
