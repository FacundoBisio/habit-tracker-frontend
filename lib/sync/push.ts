/** Subida del outbox en tandas (sin IndexedDB ni red: todo entra por `deps`, para poder testearlo). */
import { planPush, type Kind, type OutboxRow } from "./plan";

/** Tope por pedido de cada tipo. El servidor acepta más (ver `syncPush`), pero así cada pedido es chico. */
export const BATCH: Record<Kind, number> = { habit: 100, goal: 100, entry: 500 };

export interface PushSettings {
  timezone: string;
  weekStartsOn: 0 | 1 | 6;
  displayName?: string;
  displayNameUpdatedAt?: number;
}

export interface PushDeps {
  /** Filas locales por id (undefined si ya no existen). */
  load(kind: Kind, ids: string[]): Promise<unknown[]>;
  post(body: unknown): Promise<Response>;
  /** Borra del outbox las filas confirmadas por el servidor. */
  done(seqs: number[]): Promise<void>;
}

export interface PushResult {
  status: "ok" | "unauthorized" | "error";
}

interface Batch {
  upserts: Record<Kind, string[]>;
  deletes: Record<Kind, string[]>;
}

const emptyBatch = (): Batch => ({ upserts: { habit: [], entry: [], goal: [] }, deletes: { habit: [], entry: [], goal: [] } });

/**
 * Parte el plan en tandas. Los hábitos van primero: el servidor solo acepta registros y vínculos
 * de objetivos hacia hábitos que ya tiene, así que objetivos y registros arrancan cuando no queda ningún hábito por subir.
 */
export function planBatches(rows: OutboxRow[]): Batch[] {
  const plan = planPush(rows);
  const batches: Batch[] = [];
  const kinds: Kind[] = ["habit", "goal", "entry"];
  const left = () => kinds.some((k) => plan.upserts[k].length || plan.deletes[k].length);
  while (left()) {
    const b = emptyBatch();
    const habitsPending = plan.upserts.habit.length > 0;
    for (const k of kinds) {
      b.deletes[k] = plan.deletes[k].splice(0, BATCH[k]);
      if (k === "habit" || !habitsPending) b.upserts[k] = plan.upserts[k].splice(0, BATCH[k]);
    }
    batches.push(b);
  }
  return batches.length ? batches : [emptyBatch()];
}

/** Sube el outbox tanda por tanda; después de cada tanda confirmada borra del outbox solo lo de esa tanda. */
export async function pushOutbox(rows: OutboxRow[], settings: PushSettings, deps: PushDeps): Promise<PushResult> {
  const seqsOf = new Map<string, number[]>();
  for (const r of rows) {
    const key = `${r.kind}:${r.id}`;
    seqsOf.set(key, [...(seqsOf.get(key) ?? []), r.seq]);
  }

  let first = true;
  for (const b of planBatches(rows)) {
    const [habits, entries, goals] = await Promise.all([
      deps.load("habit", b.upserts.habit),
      deps.load("entry", b.upserts.entry),
      deps.load("goal", b.upserts.goal),
    ]);
    const res = await deps.post({
      habits: habits.filter(Boolean),
      entries: entries.filter(Boolean),
      goals: goals.filter(Boolean).map((g) => ({ ...(g as object), completedAt: undefined })),
      deleted: { habits: b.deletes.habit, entries: b.deletes.entry, goals: b.deletes.goal },
      // Los ajustes viajan una sola vez por sincronización
      ...(first ? { settings } : {}),
    });
    first = false;
    if (res.status === 401) return { status: "unauthorized" };
    if (!res.ok) return { status: "error" };

    const seqs: number[] = [];
    for (const k of ["habit", "goal", "entry"] as const) {
      for (const id of [...b.upserts[k], ...b.deletes[k]]) seqs.push(...(seqsOf.get(`${k}:${id}`) ?? []));
    }
    await deps.done(seqs);
  }
  return { status: "ok" };
}
