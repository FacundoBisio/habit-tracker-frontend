"use client";

import { apiFetch, getSupabase } from "@/lib/supabase/browser";
import { db, withRemote, type Entry, type Goal, type Habit } from "@/lib/store/db";
import { planProgress, planPull, planPush } from "./plan";

export type SyncStatus = "off" | "syncing" | "synced" | "pending" | "error";

interface ServerState {
  habits: Habit[];
  entries: Entry[];
  goals: (Goal & { completedAt?: undefined })[];
}

const firstSyncKey = (userId: string) => `synced-once:${userId}`;

function hasSyncedBefore(userId: string) {
  try {
    return localStorage.getItem(firstSyncKey(userId)) === "1";
  } catch {
    return false;
  }
}

/** La primera vez que se inicia sesión, sube todo lo que ya existía en el dispositivo. */
async function enqueueEverything() {
  await db.outbox.clear();
  const [habits, entries, goals] = await Promise.all([db.habits.toArray(), db.entries.toArray(), db.goals.toArray()]);
  await db.outbox.bulkAdd([
    ...habits.map((h) => ({ kind: "habit" as const, id: h.id, op: "upsert" as const })),
    ...goals.map((g) => ({ kind: "goal" as const, id: g.id, op: "upsert" as const })),
    ...entries.map((e) => ({ kind: "entry" as const, id: e.id, op: "upsert" as const })),
  ]);
}

/** Empuja lo pendiente (outbox) y después converge al estado del servidor. Devuelve el estado resultante. */
export async function syncOnce(): Promise<SyncStatus> {
  const supabase = getSupabase();
  const session = (await supabase?.auth.getSession())?.data.session;
  if (!supabase || !session) return "off";
  const userId = session.user.id;

  if (!hasSyncedBefore(userId)) await enqueueEverything();

  const rows = await db.outbox.toArray();
  const plan = planPush(rows.map((r) => ({ ...r, seq: r.seq! })));
  const settings = (await db.settings.get("me")) ?? { timezone: "America/Argentina/Cordoba", weekStartsOn: 1 };

  const [habits, entries, goals] = await Promise.all([
    db.habits.bulkGet(plan.upserts.habit),
    db.entries.bulkGet(plan.upserts.entry),
    db.goals.bulkGet(plan.upserts.goal),
  ]);

  const push = await apiFetch("/api/sync", {
    method: "POST",
    body: JSON.stringify({
      habits: habits.filter(Boolean),
      entries: entries.filter(Boolean),
      goals: goals.filter(Boolean).map((g) => ({ ...g!, completedAt: undefined })),
      deleted: { habits: plan.deletes.habit, entries: plan.deletes.entry, goals: plan.deletes.goal },
      settings: { timezone: settings.timezone, weekStartsOn: settings.weekStartsOn === 0 || settings.weekStartsOn === 6 ? settings.weekStartsOn : 1 },
    }),
  });
  if (!push.ok) return "error";
  await db.outbox.bulkDelete(rows.map((r) => r.seq!));

  const pull = await apiFetch("/api/sync");
  if (!pull.ok) return "error";
  const server = (await pull.json()) as ServerState;

  // Lo encolado mientras se sincronizaba (cambios nuevos) no se pisa ni se borra.
  const pending = new Set((await db.outbox.toArray()).map((r) => r.id));

  await withRemote(async () => {
    const hp = planPull((await db.habits.toCollection().primaryKeys()) as string[], server.habits.map((h) => h.id), pending);
    await db.habits.bulkPut(server.habits.filter((h) => hp.put.includes(h.id)));
    await db.habits.bulkDelete(hp.remove);

    const gp = planPull((await db.goals.toCollection().primaryKeys()) as string[], server.goals.map((g) => g.id), pending);
    await db.goals.bulkPut(server.goals.filter((g) => gp.put.includes(g.id)));
    await db.goals.bulkDelete(gp.remove);

    const ep = planPull((await db.entries.toCollection().primaryKeys()) as string[], server.entries.map((e) => e.id), pending);
    await db.entries.bulkPut(server.entries.filter((e) => ep.put.includes(e.id)));
    await db.entries.bulkDelete(ep.remove);
  });

  try {
    localStorage.setItem(firstSyncKey(userId), "1");
  } catch {
    /* almacenamiento bloqueado: se volverá a subir todo, que es idempotente */
  }
  return planProgress(await db.outbox.count());
}
