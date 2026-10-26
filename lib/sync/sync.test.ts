import { describe, expect, it } from "vitest";
import { createMemoryRepo } from "@/lib/server/memory-repo";
import { createSyncHandlers } from "@/lib/server/sync-handlers";
import { collapseOutbox, planProgress, planPull, planPush } from "./plan";
import type { OutboxRow } from "./plan";

const row = (seq: number, kind: OutboxRow["kind"], id: string, op: OutboxRow["op"]): OutboxRow => ({ seq, kind, id, op });

describe("plan de push", () => {
  it("solo vale la última operación por elemento", () => {
    const plan = planPush([row(1, "entry", "a", "upsert"), row(2, "entry", "a", "delete"), row(3, "habit", "h", "upsert")]);
    expect(plan.deletes.entry).toEqual(["a"]);
    expect(plan.upserts.entry).toEqual([]);
    expect(plan.upserts.habit).toEqual(["h"]);
  });

  it("crear y borrar sin haber sincronizado igual manda el delete (idempotente en el servidor)", () => {
    expect(collapseOutbox([row(1, "goal", "g", "upsert"), row(2, "goal", "g", "delete")]).get("goal:g")?.op).toBe("delete");
  });
});

describe("plan de pull", () => {
  it("lo pendiente local no se pisa ni se borra; el resto converge al servidor", () => {
    const plan = planPull(["a", "b", "c"], ["b", "c", "d"], new Set(["c", "a"]));
    expect(plan.put).toEqual(["b", "d"]);
    expect(plan.remove).toEqual([]); // 'a' está pendiente, no se borra aunque no esté en el servidor
    expect(planPull(["a", "b"], ["b"], new Set()).remove).toEqual(["a"]);
  });

  it("progreso", () => {
    expect(planProgress(0)).toBe("synced");
    expect(planProgress(3)).toBe("pending");
  });
});

describe("/api/sync (servidor)", () => {
  const H1 = "11111111-1111-4111-8111-111111111111";
  const E1 = "22222222-2222-4222-8222-222222222222";
  const habit = { id: H1, name: "Agua", emoji: "💧", color: "teal", kind: "quantity", unit: "vasos", defaultAmount: 1, schedule: { type: "daily" }, archived: false, sortOrder: 0, aliases: [] };
  const entry = { id: E1, habitId: H1, localDate: "2026-03-10", occurredAt: 1_773_000_000_000, amount: 2, source: "app", clientId: "33333333-3333-4333-8333-333333333333" };

  function setup(user: string | null = "u1") {
    const repo = createMemoryRepo();
    const h = createSyncHandlers({ repo, getUserId: async () => user, now: () => new Date() });
    const push = (body: unknown) => h.push(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
    const pull = () => h.pull(new Request("http://x"));
    return { repo, push, pull };
  }

  it("sin sesión → 401", async () => {
    const s = setup(null);
    expect((await s.pull()).status).toBe(401);
    expect((await s.push({})).status).toBe(401);
  });

  it("push y pull ida y vuelta, e idempotente al repetir", async () => {
    const s = setup();
    await s.push({ habits: [habit], entries: [entry], settings: { timezone: "America/Argentina/Cordoba", weekStartsOn: 1 } });
    await s.push({ habits: [habit], entries: [entry] });
    const data = await (await s.pull()).json();
    expect(data.habits).toHaveLength(1);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]).toMatchObject({ id: E1, amount: 2, occurredAt: entry.occurredAt });
  });

  it("borrados se propagan", async () => {
    const s = setup();
    await s.push({ habits: [habit], entries: [entry] });
    await s.push({ deleted: { entries: [E1], habits: [], goals: [] } });
    expect((await (await s.pull()).json()).entries).toHaveLength(0);
  });

  it("valida el payload y aísla usuarios", async () => {
    const s = setup();
    expect((await s.push({ habits: [{ ...habit, id: "no-uuid" }] })).status).toBe(400);
    await s.push({ habits: [habit] });
    const other = createSyncHandlers({ repo: s.repo, getUserId: async () => "u2", now: () => new Date() });
    // u2 intenta pisar el hábito de u1 con el mismo id: no debe modificarlo
    await other.push(new Request("http://x", { method: "POST", body: JSON.stringify({ habits: [{ ...habit, name: "Hackeado" }] }) }));
    const mine = await s.repo.listHabits("u1");
    expect(mine[0].name).toBe("Agua");
    expect(await (await other.pull(new Request("http://x"))).json()).toMatchObject({ habits: [] });
  });
});
