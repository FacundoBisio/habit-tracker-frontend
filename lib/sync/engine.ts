"use client";

import { toast } from "@/lib/notify";
import { saveName } from "@/lib/store/actions";
import { apiFetch, loadSupabase } from "@/lib/supabase/browser";
import { db, withRemote, type Entry, type Goal, type Habit } from "@/lib/store/db";
import { planProgress, planPull, summarizeOutbox } from "./plan";
import { pushOutbox } from "./push";

export type SyncStatus = "off" | "syncing" | "synced" | "pending" | "error";

interface ServerState {
  habits: Habit[];
  entries: Entry[];
  goals: (Goal & { completedAt?: undefined })[];
  settings?: { displayName?: string; displayNameUpdatedAt?: number };
}

// Al eliminar la cuenta se corta la sincronización antes de borrar, para que la cola no vuelva a subir nada.
let stopped = false;
export function stopSync() {
  stopped = true;
}

/** La sesión ya no vale (p. ej. la cuenta se eliminó desde otro dispositivo): se cierra solo la sesión local. */
async function endSession() {
  const supabase = await loadSupabase();
  await supabase?.auth.signOut().catch(() => {});
  toast("Tu sesión terminó. Tus datos siguen en este dispositivo.", { duration: 6000 });
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

/**
 * Nombre entre dispositivos. Sin nombre local se adopta el de la cuenta; si los dos tienen, gana el cambio más
 * nuevo. Al iniciar sesión por primera vez con otro nombre en la cuenta, se pregunta con un aviso.
 */
async function reconcileName(server: ServerState["settings"], firstSync: boolean) {
  const remote = server?.displayName;
  if (!remote) return;
  const local = await db.settings.get("me");
  const at = server.displayNameUpdatedAt ?? Date.now();
  if (!local?.name) return saveName(remote, at);
  if (local.name === remote) return;
  if (firstSync) {
    toast(`En tu cuenta te llamo ${remote}.`, { duration: 8000, action: { label: `Usar ${remote}`, onClick: () => void saveName(remote, Date.now()) } });
    return;
  }
  if (at > (local.nameUpdatedAt ?? 0)) await saveName(remote, at);
}

/** Empuja lo pendiente (outbox) y después converge al estado del servidor. Devuelve el estado resultante. */
export async function syncOnce(): Promise<SyncStatus> {
  if (stopped) return "off";
  const supabase = await loadSupabase();
  const session = (await supabase?.auth.getSession())?.data.session;
  if (!supabase || !session) return "off";
  const userId = session.user.id;

  const firstSync = !hasSyncedBefore(userId);
  if (firstSync) await enqueueEverything();

  const rows = await db.outbox.toArray();
  const alreadyRejected = new Set(summarizeOutbox(rows).rejected);
  const settings = (await db.settings.get("me")) ?? { timezone: "America/Argentina/Cordoba", weekStartsOn: 1 };
  const tables = { habit: db.habits, entry: db.entries, goal: db.goals } as const;

  // En tandas: una importación grande (o el primer inicio de sesión con mucha historia) no entra en un solo pedido.
  const push = await pushOutbox(
    rows.map((r) => ({ ...r, seq: r.seq! })),
    {
      timezone: settings.timezone,
      weekStartsOn: settings.weekStartsOn === 0 || settings.weekStartsOn === 6 ? settings.weekStartsOn : 1,
      // La primera vez no se pisa el nombre que ya tenga la cuenta: se pregunta después (ver abajo)
      ...(!firstSync && "name" in settings && settings.name ? { displayName: settings.name, displayNameUpdatedAt: settings.nameUpdatedAt } : {}),
    },
    {
      load: (kind, ids) => (tables[kind] as typeof db.habits).bulkGet(ids),
      post: (body) => apiFetch("/api/sync", { method: "POST", body: JSON.stringify(body) }),
      done: (seqs) => db.outbox.bulkDelete(seqs),
      reject: async (seqs, reason) => {
        await db.outbox.bulkUpdate(seqs.map((key) => ({ key, changes: { rejected: reason } })));
      },
    },
  );
  if (push.status === "unauthorized") {
    await endSession();
    return "off";
  }
  if (push.status === "error") return "error";
  // Se avisa solo de lo que se rechazó por primera vez (los reintentos no vuelven a mostrar el aviso).
  const fresh = push.rejected.filter((id) => !alreadyRejected.has(id)).length;
  if (fresh) notifyRejected(fresh);

  const pull = await apiFetch("/api/sync");
  if (pull.status === 401) {
    await endSession();
    return "off";
  }
  if (!pull.ok) return "error";
  const server = (await pull.json()) as ServerState;
  await reconcileName(server.settings, firstSync);

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
  // Lo rechazado no cuenta como pendiente (se informa aparte y se reintenta en la próxima)
  const [total, rejected] = await Promise.all([db.outbox.count(), db.outbox.where("rejected").above("").count()]);
  return planProgress(total - rejected);
}

/** Aviso con la opción de descartar; sin descartar, se reintenta solo en cada sincronización. */
export function notifyRejected(n: number) {
  toast.error(n === 1 ? "1 registro no se pudo sincronizar" : `${n} registros no se pudieron sincronizar`, {
    duration: 8000,
    action: { label: "Descartar", onClick: () => void discardRejected() },
  });
}

/** Descarta lo que el servidor rechazó: se saca de la cola y del dispositivo (no se reintenta más). */
export async function discardRejected() {
  const rows = await db.outbox.where("rejected").above("").toArray();
  const ids = [...new Set(rows.filter((r) => r.kind === "entry").map((r) => r.id))];
  await withRemote(async () => {
    await db.entries.bulkDelete(ids);
  });
  await db.outbox.bulkDelete(rows.map((r) => r.seq!));
}
