import { describe, expect, it } from "vitest";
import { createMemoryRepo } from "@/lib/server/memory-repo";
import { createSyncHandlers } from "@/lib/server/sync-handlers";
import type { OutboxRow } from "./plan";
import { pushOutbox, type PushDeps } from "./push";

const H1 = "11111111-1111-4111-8111-111111111111";
const habit = { id: H1, name: "Agua", emoji: "droplets", color: "teal", kind: "quantity", unit: "vasos", defaultAmount: 1, schedule: { type: "daily" }, archived: false, sortOrder: 0, aliases: [] };
const entry = (i: number) => ({
  id: crypto.randomUUID(),
  habitId: H1,
  localDate: "2026-03-10",
  occurredAt: 1_773_000_000_000 + i,
  amount: 1,
  source: "import",
  clientId: crypto.randomUUID(),
});

/** Un dispositivo falso: tablas locales + outbox, y un `fetch` que pega directo a los handlers del servidor. */
function setup() {
  const repo = createMemoryRepo();
  const handlers = createSyncHandlers({ repo, getUserId: async () => "u1", now: () => new Date() });
  const local = { habit: new Map<string, unknown>(), entry: new Map<string, unknown>(), goal: new Map<string, unknown>() };
  let outbox: (OutboxRow & { rejected?: string })[] = [];
  let seq = 0;
  const enqueue = (kind: OutboxRow["kind"], id: string, op: OutboxRow["op"] = "upsert") => outbox.push({ seq: ++seq, kind, id, op });
  const requests: { status: number; entries: number }[] = [];

  const deps: PushDeps = {
    load: async (kind, ids) => ids.map((id) => local[kind].get(id)),
    post: async (body) => {
      const res = await handlers.push(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
      requests.push({ status: res.status, entries: (body as { entries: unknown[] }).entries.length });
      return res;
    },
    done: async (seqs) => {
      const drop = new Set(seqs);
      outbox = outbox.filter((r) => !drop.has(r.seq));
    },
  };
  return { repo, local, enqueue, deps, requests, outbox: () => outbox };
}

describe("push del outbox en tandas", () => {
  it("sube 12.000 registros en varias tandas y vacía el outbox", async () => {
    const s = setup();
    s.local.habit.set(H1, habit);
    s.enqueue("habit", H1);
    for (let i = 0; i < 12_000; i++) {
      const e = entry(i);
      s.local.entry.set(e.id, e);
      s.enqueue("entry", e.id);
    }

    // Todo en un solo pedido (lo de antes) el servidor lo rechaza siempre
    const all = await s.deps.post({ habits: [habit], entries: [...s.local.entry.values()] });
    expect(all.status).toBe(400);
    s.requests.length = 0;

    const result = await pushOutbox(s.outbox(), { timezone: "UTC", weekStartsOn: 1 }, s.deps);

    expect(result.status).toBe("ok");
    expect(s.requests.every((r) => r.status === 200)).toBe(true);
    expect(s.requests.length).toBeGreaterThan(1);
    expect(Math.max(...s.requests.map((r) => r.entries))).toBeLessThanOrEqual(500);
    expect(await s.repo.listEntries("u1")).toHaveLength(12_000);
    expect(s.outbox()).toHaveLength(0);
  });

  it("si una tanda falla, solo se borra del outbox lo que ya se confirmó", async () => {
    const s = setup();
    s.local.habit.set(H1, habit);
    s.enqueue("habit", H1);
    for (let i = 0; i < 1_200; i++) {
      const e = entry(i);
      s.local.entry.set(e.id, e);
      s.enqueue("entry", e.id);
    }
    let calls = 0;
    const post = s.deps.post;
    s.deps.post = async (body) => (++calls === 3 ? new Response("boom", { status: 500 }) : post(body));

    const result = await pushOutbox(s.outbox(), { timezone: "UTC", weekStartsOn: 1 }, s.deps);

    expect(result.status).toBe("error");
    const confirmed = (await s.repo.listEntries("u1")).length;
    expect(confirmed).toBeGreaterThan(0);
    // Lo que sigue en el outbox es exactamente lo que el servidor todavía no tiene
    expect(s.outbox().filter((r) => r.kind === "entry")).toHaveLength(1_200 - confirmed);
  });

  it("sin nada pendiente igual manda una vez los ajustes", async () => {
    const s = setup();
    const result = await pushOutbox([], { timezone: "America/Argentina/Cordoba", weekStartsOn: 0 }, s.deps);
    expect(result.status).toBe("ok");
    expect(s.requests).toHaveLength(1);
    expect((await s.repo.getSettings("u1")).weekStartsOn).toBe(0);
  });
});
