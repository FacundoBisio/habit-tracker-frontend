import { describe, expect, it, vi } from "vitest";
import { createMemoryRepo } from "./memory-repo";
import type { Repo } from "./repo";
import { createSyncHandlers } from "./sync-handlers";

const H1 = "11111111-1111-4111-8111-111111111111";
const habit = (id: string, name = "Agua") => ({ id, name, emoji: "droplets", color: "teal", kind: "quantity" as const, unit: "vasos", defaultAmount: 1, schedule: { type: "daily" as const }, archived: false, sortOrder: 0, aliases: [] });
const entry = (habitId = H1) => ({ id: crypto.randomUUID(), habitId, localDate: "2026-03-10", occurredAt: 1_773_000_000_000, amount: 1, source: "app" as const, clientId: crypto.randomUUID() });
const goal = () => ({ id: crypto.randomUUID(), title: "G", kind: "count", targetValue: 3, periodStart: "2026-03-01", periodEnd: "2026-03-31", status: "active", links: [{ habitId: H1, weight: 1 }] });

function setup(repo: Repo = createMemoryRepo()) {
  const h = createSyncHandlers({ repo, getUserId: async () => "u1", now: () => new Date() });
  const push = (body: unknown) => h.push(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
  return { repo, push };
}

describe("repo: escrituras en bloque", () => {
  it("insertEntries es idempotente por clientId y devuelve lo que quedó guardado", async () => {
    const repo = createMemoryRepo();
    await repo.upsertHabits("u1", [habit(H1)]);
    const a = { ...entry(), occurredAt: new Date(1_773_000_000_000) };
    const b = { ...entry(), occurredAt: new Date(1_773_000_000_000) };
    expect([...(await repo.insertEntries("u1", [a]))]).toEqual([a.clientId]);
    expect(new Set(await repo.insertEntries("u1", [a, b]))).toEqual(new Set([a.clientId, b.clientId]));
    expect(await repo.listEntries("u1")).toHaveLength(2);
  });

  it("upsertHabits/upsertGoals no pisan filas de otro usuario", async () => {
    const repo = createMemoryRepo();
    await repo.upsertHabits("u1", [habit(H1)]);
    await repo.upsertHabits("u2", [habit(H1, "Hackeado")]);
    expect((await repo.listHabits("u1"))[0].name).toBe("Agua");
    expect(await repo.listHabits("u2")).toHaveLength(0);
    const g = goal() as Parameters<Repo["upsertGoal"]>[1];
    await repo.upsertGoals("u1", [g]);
    await repo.upsertGoals("u2", [{ ...g, title: "Hackeado" }]);
    expect((await repo.listGoals("u1"))[0].title).toBe("G");
  });

  it("transaction deshace todo si algo falla", async () => {
    const repo = createMemoryRepo();
    await expect(
      repo.transaction(async (tx) => {
        await tx.upsertHabits("u1", [habit(H1)]);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await repo.listHabits("u1")).toHaveLength(0);
  });
});

describe("push del servidor en bloque", () => {
  it("usa una escritura por tipo, dentro de una transacción, y no una por fila", async () => {
    const repo = createMemoryRepo();
    const spies = {
      tx: vi.spyOn(repo, "transaction"),
      one: vi.spyOn(repo, "insertEntry"),
      oneHabit: vi.spyOn(repo, "upsertHabit"),
      oneGoal: vi.spyOn(repo, "upsertGoal"),
      many: vi.spyOn(repo, "insertEntries"),
    };
    const s = setup(repo);
    const entries = Array.from({ length: 300 }, () => entry());
    const res = await s.push({ habits: [habit(H1)], goals: [goal(), goal()], entries });
    expect(res.status).toBe(200);
    expect(spies.tx).toHaveBeenCalledTimes(1);
    expect(spies.one).not.toHaveBeenCalled();
    expect(spies.oneHabit).not.toHaveBeenCalled();
    expect(spies.oneGoal).not.toHaveBeenCalled();
    expect(spies.many).toHaveBeenCalledTimes(1);
    expect(await repo.listEntries("u1")).toHaveLength(300);
    expect(await repo.listGoals("u1")).toHaveLength(2);
  });

  it("devuelve los ids aceptados y los rechazados con su motivo", async () => {
    const s = setup();
    const ok = entry();
    const orphan = entry("99999999-9999-4999-8999-999999999999");
    const body = await (await s.push({ habits: [habit(H1)], entries: [ok, orphan] })).json();
    expect(body.accepted).toEqual([ok.id]);
    expect(body.rejected).toEqual([{ id: orphan.id, reason: expect.any(String) }]);
    // Repetir el mismo registro es aceptado (idempotente), no rechazado
    const again = await (await s.push({ entries: [ok] })).json();
    expect(again.accepted).toEqual([ok.id]);
    expect(again.rejected).toEqual([]);
  });
});
