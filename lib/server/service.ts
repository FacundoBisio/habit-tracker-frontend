import { randomUUID } from "node:crypto";
import { toLocalDate } from "@/lib/domain/dates";
import { computeGoalProgress } from "@/lib/domain/goals";
import { weekRange } from "@/lib/domain/dates";
import { isScheduledOn } from "@/lib/domain/schedule";
import type { Repo, ServerEntry, ServerHabit, ServerSettings } from "./repo";

export const fmtNum = (n: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(n);

/**
 * Recalcula el estado de los objetivos desde `entries`. Devuelve los títulos que se completaron ahora.
 * El progreso nunca se guarda: solo el estado.
 */
export async function refreshGoals(repo: Repo, userId: string, settings: ServerSettings, today: string) {
  const [goals, entries] = await Promise.all([repo.listGoals(userId), repo.listEntries(userId)]);
  const completedNow: string[] = [];
  for (const g of goals) {
    if (g.status !== "active" && g.status !== "completed") continue;
    const p = computeGoalProgress(g, g.links, entries, today, settings.weekStartsOn);
    if (p.completed && g.status === "active") {
      await repo.setGoalStatus(userId, g.id, "completed");
      completedNow.push(g.title);
    } else if (!p.completed && g.status === "completed") {
      await repo.setGoalStatus(userId, g.id, "active");
    }
  }
  return completedNow;
}

export interface RecordInput {
  amount?: number;
  localDate?: string;
  note?: string;
  source: ServerEntry["source"];
  rawInput?: string;
  clientId?: string;
}

export async function recordEntry(repo: Repo, userId: string, habit: ServerHabit, input: RecordInput, now: Date) {
  const settings = await repo.getSettings(userId);
  return repo.insertEntry(userId, {
    habitId: habit.id,
    amount: input.amount ?? habit.defaultAmount,
    localDate: input.localDate ?? toLocalDate(now, settings.timezone),
    occurredAt: now,
    note: input.note,
    source: input.source,
    rawInput: input.rawInput,
    clientId: input.clientId ?? randomUUID(),
  });
}

/** Resumen corto tras registrar: acumulado de hoy/semana + impacto en objetivos. */
export async function impactSummary(
  repo: Repo,
  userId: string,
  habit: ServerHabit,
  amount: number,
  now: Date,
  completedGoals: string[],
) {
  const settings = await repo.getSettings(userId);
  const today = toLocalDate(now, settings.timezone);
  const [entries, goals] = await Promise.all([repo.listEntries(userId), repo.listGoals(userId)]);
  const mine = entries.filter((e) => e.habitId === habit.id);

  const head =
    habit.kind === "quantity"
      ? `✅ ${habit.name} +${fmtNum(amount)}${habit.unit ? ` ${habit.unit}` : ""}`
      : `✅ ${habit.name}`;
  const parts = [head];

  const todayTotal = mine.filter((e) => e.localDate === today).reduce((a, e) => a + e.amount, 0);
  if (habit.kind === "quantity") parts.push(`hoy ${fmtNum(todayTotal)}${habit.unit ? ` ${habit.unit}` : ""}`);

  if (habit.schedule.type === "weekly") {
    const { start, end } = weekRange(today, settings.weekStartsOn);
    const days = new Set(mine.filter((e) => e.localDate >= start && e.localDate <= end).map((e) => e.localDate));
    parts.push(`semana ${days.size}/${habit.schedule.times}`);
  }

  for (const g of goals) {
    if (g.status !== "active" && g.status !== "completed") continue;
    if (!g.links.some((l) => l.habitId === habit.id)) continue;
    const p = computeGoalProgress(g, g.links, entries, today, settings.weekStartsOn);
    parts.push(`${g.title} ${p.pct}%`);
  }

  const lines = [parts.join(" · ")];
  for (const title of completedGoals) lines.push(`🎉 Objetivo completado: ${title}`);
  return lines.join("\n");
}

/** Hábitos que faltan hoy (programados y sin registro; weekly solo si la semana no está cumplida). */
export function pendingToday(habits: ServerHabit[], entries: ServerEntry[], today: string, settings: ServerSettings) {
  const { start, end } = weekRange(today, settings.weekStartsOn);
  return habits.filter((h) => {
    if (h.archived || !isScheduledOn(h.schedule, today)) return false;
    const mine = entries.filter((e) => e.habitId === h.id);
    if (mine.some((e) => e.localDate === today)) return false;
    if (h.schedule.type === "weekly") {
      const days = new Set(mine.filter((e) => e.localDate >= start && e.localDate <= end).map((e) => e.localDate));
      return days.size < h.schedule.times;
    }
    return true;
  });
}
