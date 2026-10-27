import { describe, expect, it } from "vitest";
import { createMemoryRepo } from "./memory-repo";
import { createSyncHandlers } from "./sync-handlers";

const NOW = Date.UTC(2026, 9, 27, 12);
const DAY = 86_400_000;
const H1 = "11111111-1111-4111-8111-111111111111";
const habit = (extra: Record<string, unknown> = {}) => ({ id: H1, name: "Agua", emoji: "droplets", color: "green", kind: "quantity", unit: "vasos", defaultAmount: 1, schedule: { type: "daily" }, archived: false, sortOrder: 0, aliases: [], ...extra });
const entry = (occurredAt: number) => ({ id: crypto.randomUUID(), habitId: H1, localDate: "2026-03-10", occurredAt, amount: 1, source: "app", clientId: crypto.randomUUID() });

function setup() {
  const repo = createMemoryRepo();
  const h = createSyncHandlers({ repo, getUserId: async () => "u1", now: () => new Date(NOW) });
  const push = (body: unknown) => h.push(new Request("http://x", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));
  const storedHabit = async () => (await repo.listHabits("u1"))[0];
  const storedEntry = async () => (await repo.listEntries("u1")).at(-1)!;
  return { push, h, storedHabit, storedEntry };
}

describe("validación de /api/sync", () => {
  it("occurredAt fuera de rango se acota a [2000-01-01, mañana]; NaN se rechaza", async () => {
    const { push, storedEntry } = setup();
    expect((await push({ habits: [habit()], entries: [entry(NOW + DAY - 1)] })).status).toBe(200);
    expect((await storedEntry()).occurredAt.getTime()).toBe(NOW + DAY - 1);
    expect((await push({ habits: [habit()], entries: [entry(Date.UTC(1999, 11, 31))] })).status).toBe(200);
    expect((await storedEntry()).occurredAt.getTime()).toBe(Date.UTC(2000, 0, 1));
    expect((await push({ habits: [habit()], entries: [entry(NOW + 30 * DAY)] })).status).toBe(200);
    expect((await storedEntry()).occurredAt.getTime()).toBe(NOW + DAY);
    expect((await push({ habits: [habit()], entries: [entry(Number.NaN)] })).status).toBe(400);
  });

  it("sortOrder fuera de 0–10000 o no entero queda en 0", async () => {
    const { push, storedHabit } = setup();
    expect((await push({ habits: [habit({ sortOrder: 10_000 })] })).status).toBe(200);
    expect((await storedHabit()).sortOrder).toBe(10_000);
    for (const sortOrder of [-1, 10_001, 1.5]) {
      expect((await push({ habits: [habit({ sortOrder })] })).status).toBe(200);
      expect((await storedHabit()).sortOrder, String(sortOrder)).toBe(0);
    }
  });

  it("emoji: clave de ícono o emoji corto; cualquier otra cosa se guarda como el ícono por defecto", async () => {
    const { push, storedHabit } = setup();
    for (const emoji of ["droplets", "sparkles", "💧", "🏋️", "✅", "❤️"]) {
      expect((await push({ habits: [habit({ emoji })] })).status, emoji).toBe(200);
      expect((await storedHabit()).emoji).toBe(emoji);
    }
    for (const emoji of ["", "<script>", "javascript:alert(1)", "no-such-icon", "💧💧💧💧💧💧💧💧💧"]) {
      expect((await push({ habits: [habit({ emoji })] })).status, emoji).toBe(200);
      expect((await storedHabit()).emoji, emoji).toBe("sparkles");
    }
  });

  it("color: nombre, hex o variable CSS; cualquier otra cosa se guarda como emerald", async () => {
    const { push, storedHabit } = setup();
    for (const color of ["green", "emerald", "teal", "blue", "#148557", "#fff", "var(--accent)"]) {
      expect((await push({ habits: [habit({ color })] })).status, color).toBe(200);
      expect((await storedHabit()).color).toBe(color);
    }
    for (const color of ["", "red;background:url(x)", "url(javascript:x)", "#12345g", "expression(alert(1))", "rgb(1, 2, 3)"]) {
      expect((await push({ habits: [habit({ color })] })).status, color).toBe(200);
      expect((await storedHabit()).color, color).toBe("emerald");
    }
  });

  it("rechaza cuerpos de más de 1 MB sin parsearlos", async () => {
    const { push, h } = setup();
    const big = JSON.stringify({ habits: [habit({ name: "x".repeat(1_100_000) })] });
    expect((await push(big)).status).toBe(413);
    // También si el cliente miente en content-length
    const res = await h.push(new Request("http://x", { method: "POST", headers: { "content-length": "10" }, body: big }));
    expect(res.status).toBe(413);
    // Y si lo declara de entrada
    const declared = await h.push(new Request("http://x", { method: "POST", headers: { "content-length": String(2_000_000) }, body: "{}" }));
    expect(declared.status).toBe(413);
  });
});
