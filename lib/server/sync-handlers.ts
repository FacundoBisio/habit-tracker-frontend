import { z } from "zod";
import type { MeDeps } from "./me-handlers";
import type { ServerEntry, ServerGoal, ServerHabit } from "./repo";

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const schedule = z.union([
  z.object({ type: z.literal("daily") }),
  z.object({ type: z.literal("weekly"), times: z.number().int().min(1).max(7) }),
  z.object({ type: z.literal("days_of_week"), days: z.array(z.number().int().min(0).max(6)).min(1).max(7) }),
]);

const habitSchema = z.object({
  id: uuid,
  name: z.string().min(1).max(80),
  emoji: z.string().max(8),
  color: z.string().max(20),
  kind: z.enum(["boolean", "quantity"]),
  unit: z.string().max(20).optional(),
  defaultAmount: z.number().positive(),
  schedule,
  archived: z.boolean(),
  sortOrder: z.number().int(),
  aliases: z.array(z.string().max(60)).max(30),
});

const entrySchema = z.object({
  id: uuid,
  habitId: uuid,
  localDate: date,
  occurredAt: z.number(),
  amount: z.number().positive(),
  note: z.string().max(500).optional(),
  source: z.enum(["app", "shortcut", "siri", "bot", "import"]),
  clientId: uuid,
});

const goalSchema = z.object({
  id: uuid,
  title: z.string().min(1).max(120),
  kind: z.enum(["count", "sum", "streak", "frequency"]),
  targetValue: z.number().positive(),
  unit: z.string().max(20).optional(),
  periodStart: date,
  periodEnd: date,
  status: z.enum(["active", "completed", "failed", "archived"]),
  links: z.array(z.object({ habitId: uuid, weight: z.number().positive() })).max(50),
});

export const syncPush = z.object({
  habits: z.array(habitSchema).max(500).default([]),
  entries: z.array(entrySchema).max(5000).default([]),
  goals: z.array(goalSchema).max(200).default([]),
  deleted: z
    .object({
      habits: z.array(uuid).max(500).default([]),
      entries: z.array(uuid).max(5000).default([]),
      goals: z.array(uuid).max(200).default([]),
    })
    .default({ habits: [], entries: [], goals: [] }),
  settings: z
    .object({ timezone: z.string().max(64), weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(6)]) })
    .optional(),
});

const toWireEntry = (e: ServerEntry) => ({
  id: e.id,
  habitId: e.habitId,
  localDate: e.localDate,
  occurredAt: e.occurredAt.getTime(),
  amount: e.amount,
  note: e.note,
  source: e.source,
  clientId: e.clientId,
});

export function createSyncHandlers(deps: MeDeps) {
  return {
    /** Estado completo del usuario (el volumen de un tracker personal es chico). */
    async pull(req: Request) {
      const userId = await deps.getUserId(req);
      if (!userId) return Response.json({ ok: false, error: "No autenticado" }, { status: 401 });
      const [habits, entries, goals, settings] = await Promise.all([
        deps.repo.listHabits(userId),
        deps.repo.listEntries(userId),
        deps.repo.listGoals(userId),
        deps.repo.getSettings(userId),
      ]);
      return Response.json({
        habits,
        entries: entries.map(toWireEntry),
        goals,
        settings: { timezone: settings.timezone, weekStartsOn: settings.weekStartsOn },
      });
    },

    async push(req: Request) {
      const userId = await deps.getUserId(req);
      if (!userId) return Response.json({ ok: false, error: "No autenticado" }, { status: 401 });
      const parsed = syncPush.safeParse(await req.json().catch(() => null));
      if (!parsed.success) {
        return Response.json({ ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
      }
      const { habits, entries, goals, deleted, settings } = parsed.data;

      await deps.repo.deleteEntries(userId, deleted.entries);
      await deps.repo.deleteGoals(userId, deleted.goals);
      await deps.repo.deleteHabits(userId, deleted.habits);

      for (const h of habits) await deps.repo.upsertHabit(userId, h as ServerHabit);
      for (const g of goals) await deps.repo.upsertGoal(userId, g as ServerGoal);

      let skipped = 0;
      for (const e of entries) {
        try {
          await deps.repo.insertEntry(userId, { ...e, occurredAt: new Date(e.occurredAt) });
        } catch {
          skipped++; // p. ej. el hábito ya no existe (FK): se descarta sin frenar el resto
        }
      }
      if (settings) await deps.repo.updateSettings(userId, settings);
      return Response.json({ ok: true, skipped });
    },
  };
}
