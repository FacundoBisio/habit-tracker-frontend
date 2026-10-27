import { computeGoalProgress } from "@/lib/domain/goals";
import { toLocalDate } from "@/lib/domain/dates";
import { DEFAULT_SETTINGS, db, type Entry, type Goal, type Habit, type Settings } from "./db";

const uid = () => crypto.randomUUID();

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get("me")) ?? DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<Omit<Settings, "id">>) {
  await db.settings.put({ ...(await getSettings()), ...patch });
}

/** Cambia el nombre (ya normalizado) y anota cuándo, para sincronizarlo entre dispositivos. */
export async function saveName(name: string, at = Date.now()) {
  await saveSettings({ name, nameUpdatedAt: at });
}

export async function addHabit(input: Omit<Habit, "id" | "archived" | "sortOrder" | "aliases"> & { aliases?: string[] }) {
  const sortOrder = await db.habits.count();
  const habit: Habit = { ...input, aliases: input.aliases ?? [], id: uid(), archived: false, sortOrder };
  await db.habits.add(habit);
  return habit;
}

export async function updateHabit(id: string, patch: Partial<Habit>) {
  await db.habits.update(id, patch);
}

export async function deleteHabit(id: string) {
  await db.transaction("rw", db.habits, db.entries, db.goals, async () => {
    await db.habits.delete(id);
    await db.entries.where("habitId").equals(id).delete();
    const goals = await db.goals.toArray();
    for (const g of goals) {
      if (g.links.some((l) => l.habitId === id)) {
        await db.goals.update(g.id, { links: g.links.filter((l) => l.habitId !== id) });
      }
    }
  });
}

/** Registra una entrada y devuelve el id y los objetivos que se completaron con ella. */
export async function logEntry(input: {
  habitId: string;
  amount: number;
  localDate?: string;
  note?: string;
  source?: Entry["source"];
}) {
  const settings = await getSettings();
  const now = new Date();
  const entry: Entry = {
    id: uid(),
    clientId: uid(),
    habitId: input.habitId,
    amount: input.amount,
    localDate: input.localDate ?? toLocalDate(now, settings.timezone),
    occurredAt: now.getTime(),
    note: input.note,
    source: input.source ?? "app",
  };
  await db.entries.add(entry);
  const completedGoals = await refreshGoalStatuses(settings, [input.habitId]);
  return { entryId: entry.id, completedGoals };
}

const EPS = 1e-9;

export const sumDay = (entries: Entry[], habitId: string, localDate: string) =>
  entries.filter((e) => e.habitId === habitId && e.localDate === localDate).reduce((a, e) => a + e.amount, 0);

/**
 * Suma (delta > 0) o resta (delta < 0) cantidad a un día. Restar quita primero los registros más
 * recientes y, si hace falta, reemplaza uno por otro más chico: las entradas nunca se editan en
 * el lugar (así la sincronización solo ve altas y bajas).
 */
export async function adjustDay(habitId: string, localDate: string, delta: number) {
  if (delta > EPS) {
    const { completedGoals } = await logEntry({ habitId, amount: delta, localDate });
    return { completedGoals };
  }
  if (delta < -EPS) {
    let remaining = -delta;
    const settings = await getSettings();
    await db.transaction("rw", db.entries, async () => {
      const mine = (await db.entries.where("[habitId+localDate]").equals([habitId, localDate]).toArray()).sort(
        (a, b) => b.occurredAt - a.occurredAt,
      );
      for (const e of mine) {
        if (remaining <= EPS) break;
        await db.entries.delete(e.id);
        if (e.amount > remaining + EPS) {
          await db.entries.add({ ...e, id: uid(), clientId: uid(), amount: e.amount - remaining });
          remaining = 0;
        } else {
          remaining -= e.amount;
        }
      }
    });
    await refreshGoalStatuses(settings, null);
  }
  return { completedGoals: [] as string[] };
}

/** Deja el total del día en `total` (0 quita todo lo marcado). */
export async function setDayTotal(habitId: string, localDate: string, total: number) {
  const current = sumDay(await db.entries.where("habitId").equals(habitId).toArray(), habitId, localDate);
  return adjustDay(habitId, localDate, total - current);
}

export async function removeEntries(ids: string[]) {
  await db.entries.bulkDelete(ids);
}

/** Revierte un registro y reabre los objetivos que dejaron de cumplirse. */
export async function undoEntries(ids: string[]) {
  await db.entries.bulkDelete(ids);
  await refreshGoalStatuses(await getSettings(), null);
}

export async function addGoal(input: Omit<Goal, "id" | "status" | "completedAt">) {
  const goal: Goal = { ...input, id: uid(), status: "active" };
  await db.goals.add(goal);
  await refreshGoalStatuses(await getSettings(), null);
  return goal;
}

export async function setGoalStatus(id: string, status: Goal["status"]) {
  await db.goals.update(id, { status, completedAt: status === "completed" ? Date.now() : undefined });
}

export async function deleteGoal(id: string) {
  await db.goals.delete(id);
}

/**
 * El progreso se calcula siempre desde las entries; solo se persiste el estado.
 * Devuelve los títulos de los objetivos que pasaron a completados ahora.
 */
async function refreshGoalStatuses(settings: Settings, touchedHabits: string[] | null) {
  const today = toLocalDate(new Date(), settings.timezone);
  const entries = await db.entries.toArray();
  const newlyCompleted: string[] = [];
  for (const goal of await db.goals.toArray()) {
    if (goal.status !== "active" && goal.status !== "completed") continue;
    if (touchedHabits && !goal.links.some((l) => touchedHabits.includes(l.habitId))) continue;
    const p = computeGoalProgress(goal, goal.links, entries, today, settings.weekStartsOn);
    if (p.completed && goal.status === "active") {
      await db.goals.update(goal.id, { status: "completed", completedAt: Date.now() });
      newlyCompleted.push(goal.title);
    } else if (!p.completed && goal.status === "completed") {
      await db.goals.update(goal.id, { status: "active", completedAt: undefined });
    }
  }
  return newlyCompleted;
}
