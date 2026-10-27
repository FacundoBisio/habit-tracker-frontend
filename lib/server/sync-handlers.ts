import { z } from "zod";
import { nameSchema } from "@/lib/domain/name";
import type { MeDeps } from "./me-handlers";
import type { ServerEntry, ServerGoal, ServerHabit } from "./repo";
import { MAX_AMOUNT, isValidTimeZone } from "./validate";

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
  emoji: z.string().max(24),
  color: z.string().max(20),
  kind: z.enum(["boolean", "quantity"]),
  unit: z.string().max(20).optional(),
  defaultAmount: z.number().positive().max(MAX_AMOUNT),
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
  amount: z.number().positive().max(MAX_AMOUNT),
  note: z.string().max(500).optional(),
  source: z.enum(["app", "shortcut", "siri", "bot", "import"]),
  clientId: uuid,
});

const goalSchema = z.object({
  id: uuid,
  title: z.string().min(1).max(120),
  kind: z.enum(["count", "sum", "streak", "frequency"]),
  targetValue: z.number().positive().max(MAX_AMOUNT),
  unit: z.string().max(20).optional(),
  periodStart: date,
  periodEnd: date,
  status: z.enum(["active", "completed", "failed", "archived"]),
  links: z.array(z.object({ habitId: uuid, weight: z.number().positive().max(MAX_AMOUNT) })).max(50),
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
    .object({
      timezone: z.string().max(64).refine(isValidTimeZone, "zona horaria inválida"),
      weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(6)]),
      displayName: nameSchema.optional(),
      displayNameUpdatedAt: z.number().int().nonnegative().optional(),
    })
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
        settings: {
          timezone: settings.timezone,
          weekStartsOn: settings.weekStartsOn,
          displayName: settings.displayName,
          displayNameUpdatedAt: settings.displayNameUpdatedAt,
        },
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

      // Todo o nada, y una escritura por tipo (no una ida y vuelta a la base por fila).
      const { accepted, rejected } = await deps.repo.transaction(async (repo) => {
        await repo.deleteEntries(userId, deleted.entries);
        await repo.deleteGoals(userId, deleted.goals);
        await repo.deleteHabits(userId, deleted.habits);

        await repo.upsertHabits(userId, habits as ServerHabit[]);
        // Solo se aceptan referencias a hábitos propios: un id ajeno nunca se vincula (ni se borraría en cascada).
        const mine = new Set((await repo.listHabits(userId)).map((h) => h.id));
        await repo.upsertGoals(userId, goals.map((g) => ({ ...g, links: g.links.filter((l) => mine.has(l.habitId)) }) as ServerGoal));

        const rejected: { id: string; reason: string }[] = [];
        const candidates: typeof entries = [];
        for (const e of entries) {
          if (mine.has(e.habitId)) candidates.push(e);
          else rejected.push({ id: e.id, reason: "El hábito no existe" });
        }
        const stored = new Set(await repo.insertEntries(userId, candidates.map((e) => ({ ...e, occurredAt: new Date(e.occurredAt) }))));
        const accepted: string[] = [];
        for (const e of candidates) {
          if (stored.has(e.clientId)) accepted.push(e.id);
          else rejected.push({ id: e.id, reason: "Choca con otro registro" });
        }

        if (settings) {
          const { displayName, displayNameUpdatedAt, ...rest } = settings;
          // El nombre: gana el cambio más nuevo (dos dispositivos pueden haberlo cambiado)
          const current = await repo.getSettings(userId);
          const newer = displayName && (displayNameUpdatedAt ?? 0) > (current.displayNameUpdatedAt ?? -1);
          await repo.updateSettings(userId, newer ? { ...rest, displayName, displayNameUpdatedAt: displayNameUpdatedAt ?? deps.now().getTime() } : rest);
        }
        return { accepted, rejected };
      });
      return Response.json({ ok: true, accepted, rejected, skipped: rejected.length });
    },
  };
}
