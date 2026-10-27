/** Aplicar el estado del servidor tocando solo lo que cambió (sin IndexedDB: la tabla entra por parámetro). */
import { planPull } from "./plan";

export interface PullTable<T extends { id: string }> {
  toArray(): Promise<T[]>;
  bulkPut(rows: T[]): Promise<unknown>;
  bulkDelete(ids: string[]): Promise<unknown>;
}

/**
 * Igualdad estructural estable: no importa el orden de las claves y un campo `undefined` vale lo mismo que no tenerlo
 * (lo del servidor llega por JSON). El orden de los arreglos sí importa.
 */
export function sameRow(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameRow(x, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = (r: Record<string, unknown>) => Object.keys(r).filter((k) => r[k] !== undefined);
  const ka = keys(ra);
  return ka.length === keys(rb).length && ka.every((k) => sameRow(ra[k], rb[k]));
}

/**
 * Converge la tabla local al servidor escribiendo solo filas nuevas o distintas y borrando solo las que ya no están.
 * Con los mismos datos no escribe nada: así el pull periódico no despierta las consultas en vivo ni recalcula la UI.
 */
export async function applyPull<T extends { id: string }>(table: PullTable<T>, server: T[], pending: Set<string>) {
  const local = await table.toArray();
  const byId = new Map(local.map((r) => [r.id, r]));
  const plan = planPull(
    local.map((r) => r.id),
    server.map((r) => r.id),
    pending,
  );
  const want = new Set(plan.put);
  const put = server.filter((r) => want.has(r.id) && !sameRow(byId.get(r.id), r));
  if (put.length) await table.bulkPut(put);
  if (plan.remove.length) await table.bulkDelete(plan.remove);
}
