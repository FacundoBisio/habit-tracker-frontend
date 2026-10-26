/** Lógica pura de sincronización (sin IndexedDB ni red) para poder testearla. */

export type Kind = "habit" | "entry" | "goal";

export interface OutboxRow {
  seq: number;
  kind: Kind;
  id: string;
  op: "upsert" | "delete";
}

/** Colapsa el outbox: por (kind,id) vale solo la última operación. */
export function collapseOutbox(rows: OutboxRow[]): Map<string, OutboxRow> {
  const latest = new Map<string, OutboxRow>();
  for (const r of [...rows].sort((a, b) => a.seq - b.seq)) latest.set(`${r.kind}:${r.id}`, r);
  return latest;
}

export interface PushPlan {
  upserts: Record<Kind, string[]>;
  deletes: Record<Kind, string[]>;
}

export function planPush(rows: OutboxRow[]): PushPlan {
  const plan: PushPlan = {
    upserts: { habit: [], entry: [], goal: [] },
    deletes: { habit: [], entry: [], goal: [] },
  };
  for (const r of collapseOutbox(rows).values()) {
    (r.op === "upsert" ? plan.upserts : plan.deletes)[r.kind].push(r.id);
  }
  return plan;
}

export interface PullPlan {
  /** Ids del servidor que hay que escribir localmente. */
  put: string[];
  /** Ids locales que ya no existen en el servidor (borrados desde el bot, p. ej.). */
  remove: string[];
}

/**
 * Reconciliación tras haber empujado: lo pendiente local (outbox) nunca se pisa ni se borra;
 * el resto converge al estado del servidor.
 */
export function planPull(localIds: string[], serverIds: string[], pendingIds: Set<string>): PullPlan {
  const server = new Set(serverIds);
  return {
    put: serverIds.filter((id) => !pendingIds.has(id)),
    remove: localIds.filter((id) => !server.has(id) && !pendingIds.has(id)),
  };
}

export const planProgress = (pending: number): "synced" | "pending" => (pending > 0 ? "pending" : "synced");
