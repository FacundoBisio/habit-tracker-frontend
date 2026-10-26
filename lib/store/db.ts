import Dexie, { type Table } from "dexie";
import type { GoalKind, GoalLink, LocalDate, Schedule, WeekStart } from "@/lib/domain/types";

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  kind: "boolean" | "quantity";
  unit?: string;
  defaultAmount: number;
  schedule: Schedule;
  archived: boolean;
  sortOrder: number;
  aliases: string[];
}

export interface Entry {
  id: string;
  habitId: string;
  localDate: LocalDate;
  occurredAt: number;
  amount: number;
  note?: string;
  source: "app" | "shortcut" | "siri" | "bot" | "import";
  clientId: string;
}

export interface Goal {
  id: string;
  title: string;
  kind: GoalKind;
  targetValue: number;
  unit?: string;
  periodStart: LocalDate;
  periodEnd: LocalDate;
  status: "active" | "completed" | "failed" | "archived";
  completedAt?: number;
  links: GoalLink[];
}

export interface Settings {
  id: "me";
  timezone: string;
  weekStartsOn: WeekStart;
}

export const DEFAULT_SETTINGS: Settings = {
  id: "me",
  timezone: "America/Argentina/Cordoba",
  weekStartsOn: 1,
};

class AppDB extends Dexie {
  habits!: Table<Habit, string>;
  entries!: Table<Entry, string>;
  goals!: Table<Goal, string>;
  settings!: Table<Settings, string>;

  constructor() {
    super("habit-tracker");
    this.version(1).stores({
      habits: "id, archived, sortOrder",
      entries: "id, habitId, localDate, &clientId, [habitId+localDate]",
      goals: "id, status",
      settings: "id",
    });
  }
}

export const db = new AppDB();
