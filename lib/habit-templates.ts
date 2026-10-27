import type { Schedule } from "@/lib/domain/types";
import type { HabitIconKey } from "@/lib/habit-icons";

export interface HabitTemplate {
  name: string;
  emoji: HabitIconKey;
  kind: "boolean" | "quantity";
  unit?: string;
  defaultAmount: number;
  schedule: Schedule;
  /** Texto corto del chip (qué se crea). */
  hint: string;
}

/** Hábitos para arrancar con un toque desde la pantalla vacía (después se editan como cualquier otro). */
export const HABIT_TEMPLATES: HabitTemplate[] = [
  { name: "Agua", emoji: "droplets", kind: "quantity", unit: "vasos", defaultAmount: 1, schedule: { type: "daily" }, hint: "de a 1 vaso" },
  { name: "Gimnasio", emoji: "dumbbell", kind: "boolean", defaultAmount: 1, schedule: { type: "weekly", times: 3 }, hint: "3 veces por semana" },
  { name: "Leer", emoji: "book-open", kind: "quantity", unit: "min", defaultAmount: 20, schedule: { type: "daily" }, hint: "20 min por día" },
  { name: "Meditar", emoji: "brain", kind: "boolean", defaultAmount: 1, schedule: { type: "daily" }, hint: "todos los días" },
  { name: "Caminar", emoji: "footprints", kind: "boolean", defaultAmount: 1, schedule: { type: "daily" }, hint: "todos los días" },
  { name: "Dormir antes de las 0", emoji: "moon", kind: "boolean", defaultAmount: 1, schedule: { type: "daily" }, hint: "todas las noches" },
];
