import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "@/lib/db/test-pglite";
import { createDrizzleRepo } from "./drizzle-repo";
import { createMemoryRepo } from "./memory-repo";
import type { NewEntry, Repo, ServerGoal, ServerHabit } from "./repo";
import { DEFAULT_SERVER_SETTINGS } from "./repo";
import { createSyncHandlers } from "./sync-handlers";

/**
 * El mismo contrato contra las dos implementaciones: la de memoria (la que usan casi todos los tests)
 * y la de producción (drizzle) sobre un Postgres real (PGlite) con las migraciones de `drizzle/`.
 */

const U1 = "aaaaaaaa-0000-4000-8000-000000000001";
const U2 = "aaaaaaaa-0000-4000-8000-000000000002";
const H1 = "11111111-1111-4111-8111-111111111111";
const H2 = "22222222-2222-4222-8222-222222222222";
const G1 = "33333333-3333-4333-8333-333333333333";

const habit = (id: string, over: Partial<ServerHabit> = {}): ServerHabit => ({
  id,
  name: "Agua",
  emoji: "droplets",
  color: "teal",
  kind: "quantity",
  unit: "vasos",
  defaultAmount: 1.5,
  schedule: { type: "days_of_week", days: [1, 3, 5] },
  archived: false,
  sortOrder: 0,
  aliases: ["agua", "vaso"],
  ...over,
});
const goal = (id: string, over: Partial<ServerGoal> = {}): ServerGoal => ({
  id,
  title: "Tomar agua",
  kind: "sum",
  targetValue: 30,
  unit: "vasos",
  periodStart: "2026-03-01",
  periodEnd: "2026-03-31",
  status: "active",
  links: [{ habitId: H1, weight: 1 }],
  ...over,
});
const entry = (over: Partial<NewEntry> = {}): NewEntry & { id: string } => ({
  id: crypto.randomUUID(),
  habitId: H1,
  localDate: "2026-03-10",
  occurredAt: new Date(1_773_000_000_000),
  amount: 2,
  source: "app",
  clientId: crypto.randomUUID(),
  ...over,
});
const byClient = <T extends { clientId: string }>(list: T[]) => [...list].sort((a, b) => a.clientId.localeCompare(b.clientId));

const pg = createTestDb();
afterAll(async () => (await pg).close());

const impls: [string, () => Promise<Repo>][] = [
  ["memoria", async () => createMemoryRepo()],
  [
    "postgres (PGlite)",
    async () => {
      const { db, reset } = await pg;
      await reset();
      return createDrizzleRepo(db);
    },
  ],
];

describe.each(impls)("contrato del repo: %s", (_name, make) => {
  let repo: Repo;
  beforeAll(async () => {
    await pg; // la primera vez aplica las migraciones (puede tardar más que el timeout de un test)
  }, 60_000);
  beforeEach(async () => {
    repo = await make();
  });

  describe("hábitos", () => {
    it("upsertHabits crea, actualiza y conserva todos los campos", async () => {
      await repo.upsertHabits(U1, [habit(H1), habit(H2, { name: "Leer", kind: "boolean", unit: undefined, sortOrder: 1, aliases: [] })]);
      expect(await repo.listHabits(U1)).toEqual([habit(H1), habit(H2, { name: "Leer", kind: "boolean", unit: undefined, sortOrder: 1, aliases: [] })]);

      await repo.upsertHabits(U1, [habit(H1, { name: "Agua fría", archived: true, schedule: { type: "weekly", times: 3 }, unit: undefined })]);
      const [h1] = await repo.listHabits(U1);
      expect(h1).toEqual(habit(H1, { name: "Agua fría", archived: true, schedule: { type: "weekly", times: 3 }, unit: undefined }));
    });

    it("con el mismo id dos veces en el lote vale el último", async () => {
      await repo.upsertHabits(U1, [habit(H1, { name: "Primero" }), habit(H1, { name: "Último" })]);
      expect((await repo.listHabits(U1)).map((h) => h.name)).toEqual(["Último"]);
    });

    it("upsertHabits/upsertHabit nunca pisan el hábito de otro usuario", async () => {
      await repo.upsertHabits(U1, [habit(H1)]);
      await repo.upsertHabits(U2, [habit(H1, { name: "Hackeado" })]);
      await repo.upsertHabit(U2, habit(H1, { name: "Hackeado 2" }));
      await repo.updateHabit(U2, H1, { name: "Hackeado 3" });
      expect((await repo.listHabits(U1)).map((h) => h.name)).toEqual(["Agua"]);
      expect(await repo.listHabits(U2)).toEqual([]);
    });

    it("createHabit numera el orden por usuario", async () => {
      await repo.upsertHabits(U2, [habit(H2)]);
      const a = await repo.createHabit(U1, { name: "A", emoji: "sparkles", color: "emerald", kind: "boolean", defaultAmount: 1, schedule: { type: "daily" }, aliases: [] });
      const b = await repo.createHabit(U1, { name: "B", emoji: "sparkles", color: "emerald", kind: "boolean", defaultAmount: 1, schedule: { type: "daily" }, aliases: [] });
      expect([a.sortOrder, b.sortOrder]).toEqual([0, 1]);
      expect(a.archived).toBe(false);
      expect((await repo.listHabits(U1)).map((h) => h.name)).toEqual(["A", "B"]);
    });

    it("deleteHabits borra solo lo propio y en cascada sus registros", async () => {
      await repo.upsertHabits(U1, [habit(H1)]);
      await repo.upsertHabits(U2, [habit(H2)]);
      await repo.insertEntries(U1, [entry()]);
      await repo.insertEntries(U2, [entry({ habitId: H2 })]);
      await repo.deleteHabits(U2, [H1]);
      expect(await repo.listHabits(U1)).toHaveLength(1);
      await repo.deleteHabits(U1, [H1, H2]);
      expect(await repo.listHabits(U1)).toEqual([]);
      expect(await repo.listEntries(U1)).toEqual([]);
      expect(await repo.listHabits(U2)).toHaveLength(1);
      expect(await repo.listEntries(U2)).toHaveLength(1);
      await repo.deleteHabits(U1, []);
    });
  });

  describe("objetivos", () => {
    beforeEach(async () => {
      await repo.upsertHabits(U1, [habit(H1), habit(H2, { sortOrder: 1 })]);
    });

    it("upsertGoals crea y reemplaza los vínculos", async () => {
      await repo.upsertGoals(U1, [goal(G1)]);
      expect(await repo.listGoals(U1)).toEqual([goal(G1)]);
      await repo.upsertGoals(U1, [goal(G1, { title: "Otro", unit: undefined, status: "completed", links: [{ habitId: H2, weight: 2 }] })]);
      expect(await repo.listGoals(U1)).toEqual([goal(G1, { title: "Otro", unit: undefined, status: "completed", links: [{ habitId: H2, weight: 2 }] })]);
      await repo.upsertGoal(U1, goal(G1, { links: [] }));
      expect((await repo.listGoals(U1))[0].links).toEqual([]);
    });

    it("el mismo hábito repetido en los vínculos no rompe el guardado (vale el último)", async () => {
      await repo.upsertGoals(U1, [goal(G1, { links: [{ habitId: H1, weight: 1 }, { habitId: H1, weight: 3 }] })]);
      expect((await repo.listGoals(U1))[0].links).toEqual([{ habitId: H1, weight: 3 }]);
      await repo.upsertGoal(U1, goal(G1, { links: [{ habitId: H2, weight: 1 }, { habitId: H2, weight: 4 }] }));
      expect((await repo.listGoals(U1))[0].links).toEqual([{ habitId: H2, weight: 4 }]);
    });

    it("nunca pisa el objetivo de otro usuario", async () => {
      await repo.upsertGoals(U1, [goal(G1)]);
      await repo.upsertGoals(U2, [goal(G1, { title: "Hackeado", links: [] })]);
      await repo.upsertGoal(U2, goal(G1, { title: "Hackeado 2", links: [] }));
      await repo.setGoalStatus(U2, G1, "failed");
      await repo.deleteGoals(U2, [G1]);
      expect(await repo.listGoals(U1)).toEqual([goal(G1)]);
      expect(await repo.listGoals(U2)).toEqual([]);
    });

    it("borrar un hábito lo saca de los vínculos de los objetivos", async () => {
      await repo.upsertGoals(U1, [goal(G1, { links: [{ habitId: H1, weight: 1 }, { habitId: H2, weight: 1 }] })]);
      await repo.deleteHabits(U1, [H1]);
      expect((await repo.listGoals(U1))[0].links).toEqual([{ habitId: H2, weight: 1 }]);
    });

    it("setGoalStatus y deleteGoals", async () => {
      await repo.upsertGoals(U1, [goal(G1)]);
      await repo.setGoalStatus(U1, G1, "completed");
      expect((await repo.listGoals(U1))[0].status).toBe("completed");
      await repo.deleteGoals(U1, [G1]);
      expect(await repo.listGoals(U1)).toEqual([]);
    });
  });

  describe("registros", () => {
    beforeEach(async () => {
      await repo.upsertHabits(U1, [habit(H1)]);
      await repo.upsertHabits(U2, [habit(H2)]);
    });

    it("insertEntries es idempotente por clientId (también dentro del mismo lote)", async () => {
      const a = entry({ note: "con nota", rawInput: "2 vasos", source: "bot" });
      const b = entry();
      expect(await repo.insertEntries(U1, [a])).toEqual([a.clientId]);
      expect(new Set(await repo.insertEntries(U1, [a, b, { ...b, id: crypto.randomUUID() }]))).toEqual(new Set([a.clientId, b.clientId]));
      const list = await repo.listEntries(U1);
      expect(byClient(list)).toEqual(byClient([{ ...a }, { ...b, note: undefined, rawInput: undefined }]));
    });

    it("insertEntries no guarda un registro cuyo id ya usa otra fila (de otro usuario)", async () => {
      const theirs = entry({ habitId: H2 });
      await repo.insertEntries(U2, [theirs]);
      const clash = entry({ id: theirs.id });
      const ok = entry();
      expect(await repo.insertEntries(U1, [clash, ok])).toEqual([ok.clientId]);
      expect((await repo.listEntries(U2))[0].clientId).toBe(theirs.clientId);
      expect((await repo.listEntries(U1)).map((e) => e.clientId)).toEqual([ok.clientId]);
    });

    it("el mismo clientId en dos usuarios son registros distintos", async () => {
      const clientId = crypto.randomUUID();
      expect(await repo.insertEntries(U1, [entry({ clientId })])).toEqual([clientId]);
      expect(await repo.insertEntries(U2, [entry({ clientId, habitId: H2 })])).toEqual([clientId]);
      expect(await repo.listEntries(U1)).toHaveLength(1);
      expect(await repo.listEntries(U2)).toHaveLength(1);
    });

    it("insertEntry devuelve el existente si el clientId se repite", async () => {
      const a = entry();
      const first = await repo.insertEntry(U1, a);
      expect(first.duplicate).toBe(false);
      expect(first.entry).toMatchObject({ id: a.id, clientId: a.clientId, amount: 2, localDate: "2026-03-10" });
      const again = await repo.insertEntry(U1, { ...a, id: undefined, amount: 9 });
      expect(again.duplicate).toBe(true);
      expect(again.entry).toMatchObject({ id: a.id, amount: 2 });
      const noId = await repo.insertEntry(U1, { ...entry(), id: undefined });
      expect(noId.entry.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("listEntries filtra por rango de fechas (incluye los extremos)", async () => {
      const days = ["2026-02-28", "2026-03-01", "2026-03-15", "2026-03-31", "2026-04-01"];
      await repo.insertEntries(U1, days.map((localDate) => entry({ localDate })));
      const dates = async (range?: { from?: string; to?: string }) => (await repo.listEntries(U1, range)).map((e) => e.localDate).sort();
      expect(await dates()).toEqual(days);
      expect(await dates({ from: "2026-03-01", to: "2026-03-31" })).toEqual(["2026-03-01", "2026-03-15", "2026-03-31"]);
      expect(await dates({ from: "2026-03-31" })).toEqual(["2026-03-31", "2026-04-01"]);
      expect(await dates({ to: "2026-02-28" })).toEqual(["2026-02-28"]);
    });

    it("deleteEntries solo borra registros propios", async () => {
      const mine = entry();
      const theirs = entry({ habitId: H2 });
      await repo.insertEntries(U1, [mine]);
      await repo.insertEntries(U2, [theirs]);
      await repo.deleteEntries(U1, [theirs.id]);
      expect(await repo.listEntries(U2)).toHaveLength(1);
      await repo.deleteEntries(U1, [mine.id]);
      expect(await repo.listEntries(U1)).toEqual([]);
      await repo.deleteEntries(U1, []);
    });

    it("lotes de más de 500 filas (varias sentencias), con repetidos entre partes", async () => {
      const list = Array.from({ length: 1100 }, () => entry());
      const withDup = [...list, { ...list[3], id: crypto.randomUUID() }];
      expect(new Set(await repo.insertEntries(U1, withDup))).toEqual(new Set(list.map((e) => e.clientId)));
      expect(await repo.listEntries(U1)).toHaveLength(1100);
    });

    it("guarda decimales y fechas con precisión de milisegundos", async () => {
      const a = entry({ amount: 0.25, occurredAt: new Date(1_773_000_000_123) });
      await repo.insertEntries(U1, [a]);
      const [got] = await repo.listEntries(U1);
      expect(got.amount).toBe(0.25);
      expect(got.occurredAt.getTime()).toBe(1_773_000_000_123);
    });
  });

  describe("transacciones", () => {
    it("deshace todo si algo falla", async () => {
      await repo.upsertHabits(U1, [habit(H1)]);
      await expect(
        repo.transaction(async (tx) => {
          await tx.upsertHabits(U1, [habit(H1, { name: "Cambiado" }), habit(H2)]);
          await tx.insertEntries(U1, [entry()]);
          await tx.updateSettings(U1, { timezone: "UTC" });
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect((await repo.listHabits(U1)).map((h) => h.name)).toEqual(["Agua"]);
      expect(await repo.listEntries(U1)).toEqual([]);
      expect((await repo.getSettings(U1)).timezone).toBe(DEFAULT_SERVER_SETTINGS.timezone);
    });

    it("confirma y devuelve el resultado si todo sale bien", async () => {
      const out = await repo.transaction(async (tx) => {
        await tx.upsertHabits(U1, [habit(H1)]);
        return tx.insertEntries(U1, [entry()]);
      });
      expect(out).toHaveLength(1);
      expect(await repo.listEntries(U1)).toHaveLength(1);
    });
  });

  describe("ajustes", () => {
    it("devuelve los valores por defecto sin fila y aplica cambios parciales", async () => {
      expect(await repo.getSettings(U1)).toEqual(DEFAULT_SERVER_SETTINGS);
      await repo.updateSettings(U1, { timezone: "Europe/Madrid", weekStartsOn: 0 });
      await repo.updateSettings(U1, { displayName: "Facu", displayNameUpdatedAt: 1_773_000_000_456 });
      await repo.updateSettings(U1, { reminderTime: "08:30", remindersEnabled: true });
      expect(await repo.getSettings(U1)).toEqual({
        ...DEFAULT_SERVER_SETTINGS,
        timezone: "Europe/Madrid",
        weekStartsOn: 0,
        reminderTime: "08:30",
        remindersEnabled: true,
        displayName: "Facu",
        displayNameUpdatedAt: 1_773_000_000_456,
      });
      expect(await repo.getSettings(U2)).toEqual(DEFAULT_SERVER_SETTINGS);
    });
  });

  describe("tokens", () => {
    it("crea, encuentra, marca uso, lista y revoca (solo el dueño)", async () => {
      const { id } = await repo.createToken(U1, "Atajo", "hash-1");
      expect(await repo.findToken("hash-1")).toEqual({ id, userId: U1 });
      expect(await repo.findToken("otro")).toBeNull();
      await repo.touchToken(id);
      const [listed] = await repo.listTokens(U1);
      expect(listed).toMatchObject({ id, name: "Atajo", revokedAt: null });
      expect(listed.lastUsedAt).toBeInstanceOf(Date);
      expect(listed.createdAt).toBeInstanceOf(Date);
      expect(await repo.listTokens(U2)).toEqual([]);
      await repo.revokeToken(U2, id);
      expect(await repo.findToken("hash-1")).not.toBeNull();
      await repo.revokeToken(U1, id);
      expect(await repo.findToken("hash-1")).toBeNull();
      expect((await repo.listTokens(U1))[0].revokedAt).toBeInstanceOf(Date);
    });
  });

  describe("Telegram", () => {
    const now = new Date("2026-03-10T12:00:00Z");
    const later = new Date("2026-03-10T12:10:00Z");

    it("un código se usa una sola vez y vence", async () => {
      await repo.createLinkCode(U1, "ABC123", later);
      await repo.createLinkCode(U1, "VENCIDO", now);
      expect(await repo.consumeLinkCode("NOEXISTE", "chat-1", now)).toBeNull();
      expect(await repo.consumeLinkCode("VENCIDO", "chat-1", now)).toBeNull();
      expect(await repo.consumeLinkCode("ABC123", "chat-1", now)).toBe(U1);
      expect(await repo.consumeLinkCode("ABC123", "chat-1", now)).toBeNull();
      expect(await repo.findUserByChat("chat-1")).toBe(U1);
      expect((await repo.getSettings(U1)).telegramChatId).toBe("chat-1");
    });

    it("vincular un chat ya usado lo desvincula de la cuenta anterior (índice único)", async () => {
      await repo.createLinkCode(U1, "C1", later);
      await repo.createLinkCode(U2, "C2", later);
      await repo.createLinkCode(U1, "C3", later);
      expect(await repo.consumeLinkCode("C1", "chat-1", now)).toBe(U1);
      await repo.updateSettings(U1, { remindersEnabled: true, timezone: "UTC" });
      expect(await repo.consumeLinkCode("C2", "chat-1", now)).toBe(U2);
      expect(await repo.findUserByChat("chat-1")).toBe(U2);
      const old = await repo.getSettings(U1);
      expect(old.telegramChatId).toBeUndefined();
      expect(old.remindersEnabled).toBe(false);
      expect(old.timezone).toBe("UTC");
      // Volver a vincular la misma cuenta al mismo chat no la desvincula
      expect(await repo.consumeLinkCode("C3", "chat-1", now)).toBe(U1);
      expect(await repo.findUserByChat("chat-1")).toBe(U1);
      expect((await repo.getSettings(U2)).telegramChatId).toBeUndefined();
    });

    it("listReminderTargets, unlinkTelegram", async () => {
      await repo.createLinkCode(U1, "C1", later);
      await repo.consumeLinkCode("C1", "chat-1", now);
      expect(await repo.listReminderTargets()).toEqual([]);
      await repo.updateSettings(U1, { remindersEnabled: true, reminderTime: "22:15" });
      await repo.updateSettings(U2, { remindersEnabled: true }); // sin chat: no recibe
      expect(await repo.listReminderTargets()).toEqual([
        { userId: U1, chatId: "chat-1", timezone: DEFAULT_SERVER_SETTINGS.timezone, reminderTime: "22:15" },
      ]);
      await repo.unlinkTelegram(U1);
      expect(await repo.listReminderTargets()).toEqual([]);
      expect(await repo.findUserByChat("chat-1")).toBeNull();
      expect((await repo.getSettings(U1)).remindersEnabled).toBe(false);
    });

    it("claimReminder gana una sola vez por día", async () => {
      await repo.updateSettings(U1, { remindersEnabled: true });
      expect(await repo.claimReminder(U1, "2026-03-10")).toBe(true);
      expect(await repo.claimReminder(U1, "2026-03-10")).toBe(false);
      expect(await repo.claimReminder(U1, "2026-03-09")).toBe(false);
      expect(await repo.claimReminder(U1, "2026-03-11")).toBe(true);
      const both = await Promise.all([repo.claimReminder(U1, "2026-03-12"), repo.claimReminder(U1, "2026-03-12")]);
      expect(both.filter(Boolean)).toHaveLength(1);
    });

    it("confirmaciones pendientes: solo las toma el mismo chat, una vez", async () => {
      const id = await repo.savePending(U1, "chat-1", { habitId: H1, amount: 2, nested: { ok: true } });
      expect(await repo.takePending(id, "chat-2")).toBeNull();
      expect(await repo.takePending(id, "chat-1")).toEqual({ userId: U1, payload: { habitId: H1, amount: 2, nested: { ok: true } } });
      expect(await repo.takePending(id, "chat-1")).toBeNull();
    });

    it("purgeStale borra códigos usados o vencidos y pendientes viejos", async () => {
      const t0 = new Date();
      const future = new Date(t0.getTime() + 600_000);
      await repo.createLinkCode(U1, "VIGENTE", future);
      await repo.createLinkCode(U1, "USADO", future);
      await repo.createLinkCode(U1, "VENCIDO", new Date(t0.getTime() - 1000));
      await repo.consumeLinkCode("USADO", "chat-1", t0);
      await repo.savePending(U1, "chat-1", { a: 1 });
      await repo.savePending(U2, "chat-2", { b: 2 });
      expect(await repo.purgeStale({ now: t0, pendingBefore: new Date(t0.getTime() - 3_600_000) })).toEqual({ linkCodes: 2, pending: 0 });
      expect(await repo.purgeStale({ now: t0, pendingBefore: new Date(t0.getTime() + 3_600_000) })).toEqual({ linkCodes: 0, pending: 2 });
      expect(await repo.consumeLinkCode("VIGENTE", "chat-9", t0)).toBe(U1);
    });
  });

  describe("deleteUserData", () => {
    it("borra todo lo del usuario, nada de otros, y es idempotente", async () => {
      for (const [u, h] of [[U1, H1], [U2, H2]] as const) {
        await repo.upsertHabits(u, [habit(h)]);
        await repo.insertEntries(u, [entry({ habitId: h })]);
        await repo.upsertGoals(u, [goal(u === U1 ? G1 : crypto.randomUUID(), { links: [{ habitId: h, weight: 1 }] })]);
        await repo.updateSettings(u, { displayName: "X" });
        await repo.createToken(u, "t", `hash-${u}`);
        await repo.createLinkCode(u, `code-${u}`, new Date(Date.now() + 600_000));
        await repo.savePending(u, `chat-${u}`, {});
      }
      const pendingU1 = await repo.savePending(U1, "chat-x", {});
      await repo.deleteUserData(U1);
      await repo.deleteUserData(U1);
      expect(await repo.listHabits(U1)).toEqual([]);
      expect(await repo.listEntries(U1)).toEqual([]);
      expect(await repo.listGoals(U1)).toEqual([]);
      expect(await repo.getSettings(U1)).toEqual(DEFAULT_SERVER_SETTINGS);
      expect(await repo.listTokens(U1)).toEqual([]);
      expect(await repo.findToken(`hash-${U1}`)).toBeNull();
      expect(await repo.consumeLinkCode(`code-${U1}`, "c", new Date())).toBeNull();
      expect(await repo.takePending(pendingU1, "chat-x")).toBeNull();

      expect(await repo.listHabits(U2)).toHaveLength(1);
      expect(await repo.listEntries(U2)).toHaveLength(1);
      expect((await repo.listGoals(U2))[0].links).toHaveLength(1);
      expect((await repo.getSettings(U2)).displayName).toBe("X");
      expect(await repo.findToken(`hash-${U2}`)).not.toBeNull();
      expect(await repo.consumeLinkCode(`code-${U2}`, "c", new Date())).toBe(U2);
    });
  });

  describe("sincronización (handlers) sobre este repo", () => {
    function handlers(userId = U1) {
      const h = createSyncHandlers({ repo, getUserId: async () => userId, now: () => new Date() });
      return {
        push: (body: unknown) => h.push(new Request("http://x", { method: "POST", body: JSON.stringify(body) })),
        pull: async () => (await h.pull(new Request("http://x"))).json(),
      };
    }
    const wireEntry = (over: Record<string, unknown> = {}) => ({
      id: crypto.randomUUID(),
      habitId: H1,
      localDate: "2026-03-10",
      occurredAt: 1_773_000_000_000,
      amount: 1,
      source: "app",
      clientId: crypto.randomUUID(),
      ...over,
    });

    it("push → pull devuelve lo mismo que se subió, y reintentar es idempotente", async () => {
      const { push, pull } = handlers();
      const entries = [wireEntry({ note: "hola" }), wireEntry({ localDate: "2026-03-11", amount: 2.5 })];
      const body = {
        habits: [habit(H1), habit(H2, { name: "Leer", sortOrder: 1, unit: undefined })],
        entries,
        goals: [goal(G1, { links: [{ habitId: H1, weight: 1 }, { habitId: H2, weight: 2 }] })],
        settings: { timezone: "Europe/Madrid", weekStartsOn: 0, displayName: "Facu", displayNameUpdatedAt: 1_773_000_000_000 },
      };
      const first = await (await push(body)).json();
      expect(first).toMatchObject({ ok: true, rejected: [] });
      expect(new Set(first.accepted)).toEqual(new Set(entries.map((e) => e.id)));
      const again = await (await push(body)).json();
      expect(new Set(again.accepted)).toEqual(new Set(entries.map((e) => e.id)));

      const state = await pull();
      expect(state.habits).toEqual(JSON.parse(JSON.stringify(body.habits)));
      expect(byClient(state.entries)).toEqual(byClient(entries));
      expect(state.goals).toEqual(body.goals);
      expect(state.settings).toEqual(body.settings);
    });

    it("borrados, ids ajenos y referencias a hábitos ajenos", async () => {
      await handlers(U2).push({ habits: [habit(H2, { name: "De otro" })] });
      const { push, pull } = handlers();
      const ok = wireEntry();
      const res = await (
        await push({
          habits: [habit(H1), habit(H2, { name: "Robado" })],
          entries: [ok, wireEntry({ habitId: H2 })],
          goals: [goal(G1, { links: [{ habitId: H1, weight: 1 }, { habitId: H2, weight: 1 }] })],
        })
      ).json();
      expect(res.accepted).toEqual([ok.id]);
      expect(res.rejected).toHaveLength(1);
      const state = await pull();
      expect(state.habits.map((h: ServerHabit) => h.id)).toEqual([H1]);
      expect(state.goals[0].links).toEqual([{ habitId: H1, weight: 1 }]);
      expect((await handlers(U2).pull()).habits[0].name).toBe("De otro");

      await push({ deleted: { entries: [ok.id], goals: [G1], habits: [H1] } });
      expect(await pull()).toMatchObject({ habits: [], entries: [], goals: [] });
    });

    it("un nombre más viejo no pisa al más nuevo", async () => {
      const { push, pull } = handlers();
      const tz = { timezone: "UTC", weekStartsOn: 1 };
      await push({ settings: { ...tz, displayName: "Nuevo", displayNameUpdatedAt: 2000 } });
      await push({ settings: { ...tz, displayName: "Viejo", displayNameUpdatedAt: 1000 } });
      expect((await pull()).settings).toEqual({ ...tz, displayName: "Nuevo", displayNameUpdatedAt: 2000 });
    });

    it("un objetivo con el mismo hábito dos veces no rompe la sincronización", async () => {
      const { push, pull } = handlers();
      const res = await push({ habits: [habit(H1)], goals: [goal(G1, { links: [{ habitId: H1, weight: 1 }, { habitId: H1, weight: 2 }] })] });
      expect(res.status).toBe(200);
      expect((await pull()).goals[0].links).toEqual([{ habitId: H1, weight: 2 }]);
    });

    it("ids en mayúsculas se tratan igual que en minúsculas", async () => {
      const { push, pull } = handlers();
      const e = wireEntry({ habitId: H1.toUpperCase(), clientId: crypto.randomUUID().toUpperCase(), id: crypto.randomUUID().toUpperCase() });
      const res = await (await push({ habits: [habit(H1)], entries: [e] })).json();
      expect(res).toMatchObject({ ok: true, accepted: [e.id], rejected: [] });
      expect((await pull()).entries).toHaveLength(1);
    });

    it("una fecha imposible se rechaza con 400 (no rompe la transacción)", async () => {
      const { push } = handlers();
      const res = await push({ habits: [habit(H1)], entries: [wireEntry({ localDate: "2026-02-30" })] });
      expect(res.status).toBe(400);
      const goalRes = await push({ habits: [habit(H1)], goals: [goal(G1, { periodEnd: "2026-13-01" })] });
      expect(goalRes.status).toBe(400);
      expect((await push({ habits: [habit(H1)], entries: [wireEntry({ localDate: "0000-01-01" })] })).status).toBe(400);
    });

    it("un texto con el carácter NUL no rompe la sincronización", async () => {
      const { push, pull } = handlers();
      const res = await push({ habits: [habit(H1, { name: "Agua\u0000", aliases: ["a\u0000b"] })], entries: [wireEntry({ note: "n\u0000" })] });
      expect(res.status).toBe(200);
      const state = await pull();
      expect(state.habits[0]).toMatchObject({ name: "Agua", aliases: ["ab"] });
      expect(state.entries[0].note).toBe("n");
    });
  });
});
