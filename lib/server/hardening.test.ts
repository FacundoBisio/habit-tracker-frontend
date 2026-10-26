import { describe, expect, it, vi } from "vitest";
import { createMemoryRepo } from "./memory-repo";
import { createQuickHandlers } from "./quick-handlers";
import { createSyncHandlers } from "./sync-handlers";
import { createRateLimiter, generateToken } from "./security";
import { rulesParser } from "@/lib/nl";
import { createGroqParser } from "@/lib/nl/llm";
import type { ParseContext } from "@/lib/nl/types";
import { runReminders } from "@/lib/telegram/reminders";
import type { TelegramClient } from "@/lib/telegram/api";

const U1 = "11111111-aaaa-4aaa-8aaa-111111111111";
const H_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const H_B = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";
const habit = (id: string) => ({ id, name: "Agua", emoji: "droplets", color: "green", kind: "quantity", unit: "vasos", defaultAmount: 1, schedule: { type: "daily" }, archived: false, sortOrder: 0, aliases: [] });
const entry = (habitId: string, n = 1) => ({ id: crypto.randomUUID(), habitId, localDate: "2026-03-10", occurredAt: 1_773_000_000_000, amount: n, source: "app", clientId: crypto.randomUUID() });

function syncSetup() {
  const repo = createMemoryRepo();
  const as = (user: string) => createSyncHandlers({ repo, getUserId: async () => user, now: () => new Date() });
  const push = (user: string, body: unknown) => as(user).push(new Request("http://x", { method: "POST", body: JSON.stringify(body) }));
  return { repo, push };
}

describe("endurecimiento de /api/sync", () => {
  it("no vincula registros a hábitos de otro usuario", async () => {
    const { repo, push } = syncSetup();
    await push("user-a", { habits: [habit(H_A)] });
    // user-b intenta colgar un registro del hábito de user-a
    const res = await (await push("user-b", { habits: [habit(H_B)], entries: [entry(H_A), entry(H_B)] })).json();
    expect(res.skipped).toBe(1);
    expect(await repo.listEntries("user-a")).toHaveLength(0);
    expect(await repo.listEntries("user-b")).toHaveLength(1);
  });

  it("descarta vínculos de objetivos hacia hábitos ajenos", async () => {
    const { repo, push } = syncSetup();
    await push("user-a", { habits: [habit(H_A)] });
    const goal = { id: crypto.randomUUID(), title: "G", kind: "count", targetValue: 3, periodStart: "2026-03-01", periodEnd: "2026-03-31", status: "active", links: [{ habitId: H_A, weight: 1 }, { habitId: H_B, weight: 1 }] };
    await push("user-b", { habits: [habit(H_B)], goals: [goal] });
    const [g] = await repo.listGoals("user-b");
    expect(g.links.map((l) => l.habitId)).toEqual([H_B]);
  });

  it("rechaza cantidades absurdas y zonas horarias inválidas", async () => {
    const { push } = syncSetup();
    expect((await push("u", { habits: [habit(H_A)], entries: [entry(H_A, 1e9)] })).status).toBe(400);
    expect((await push("u", { settings: { timezone: "Mars/Olympus", weekStartsOn: 1 } })).status).toBe(400);
  });
});

describe("endurecimiento de /api/quick", () => {
  it("rechaza una cantidad absurda", async () => {
    const repo = createMemoryRepo();
    await repo.createHabit(U1, { name: "Agua", emoji: "droplets", color: "green", kind: "quantity", defaultAmount: 1, schedule: { type: "daily" }, aliases: [] });
    const { token, hash } = generateToken();
    await repo.createToken(U1, "t", hash);
    const h = createQuickHandlers({ repo, parser: rulesParser, limiter: createRateLimiter(50, 60_000), now: () => new Date() });
    const res = await h.log(new Request("http://x/api/quick/log", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ habit: "agua", amount: 1e12 }) }));
    expect(res.status).toBe(400);
  });
});

describe("endurecimiento del lenguaje natural", () => {
  const ctx: ParseContext = { today: "2026-03-11", timezone: "UTC", habits: [{ id: "g", name: "Gym", aliases: [], kind: "boolean", unit: undefined, defaultAmount: 1 }] };
  it("descarta fechas de hace más de un año que devuelve el modelo", async () => {
    const body = { choices: [{ message: { content: JSON.stringify({ items: [{ habit: "g", amount: 1, date: "1999-01-01" }, { habit: "g", amount: 1, date: "2026-03-01" }] }) } }] };
    const f = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body))));
    const out = await createGroqParser({ apiKey: "k", fetch: f as unknown as typeof fetch }).parse("x", ctx);
    expect(out.map((i) => i.localDate)).toEqual(["2026-03-01"]);
  });
});

describe("recordatorios aislados por usuario", () => {
  it("un usuario con zona horaria rota no frena los avisos de los demás", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const repo = createMemoryRepo();
    for (const [user, tz] of [["bad", "Mars/Olympus"], ["ok", "UTC"]] as const) {
      await repo.createHabit(user, { name: "Agua", emoji: "droplets", color: "green", kind: "boolean", defaultAmount: 1, schedule: { type: "daily" }, aliases: [] });
      await repo.updateSettings(user, { telegramChatId: user, remindersEnabled: true, reminderTime: "10:00", timezone: tz });
    }
    const sent: string[] = [];
    const tg: TelegramClient = { sendMessage: async (c) => void sent.push(c), editMessage: async () => {}, answerCallback: async () => {} };
    const n = await runReminders({ repo, tg, now: () => new Date("2026-03-11T10:00:00Z") });
    expect(n).toBe(1);
    expect(sent).toEqual(["ok"]);
  });
});
