import { describe, expect, it, vi } from "vitest";
import { createMemoryRepo } from "./memory-repo";
import { createMeHandlers, type MeDeps } from "./me-handlers";
import { createSyncHandlers } from "./sync-handlers";
import { createRateLimiter, hashToken } from "./security";

const NOW = new Date("2026-03-11T12:00:00Z");
const H1 = "11111111-1111-4111-8111-111111111111";
const H2 = "22222222-2222-4222-8222-222222222222";

function setup(extra: Partial<MeDeps> = {}) {
  const repo = createMemoryRepo();
  let user: string | null = "u1";
  const deps: MeDeps = { repo, getUserId: async () => user, now: () => NOW, ...extra };
  return { repo, handlers: createMeHandlers(deps), sync: createSyncHandlers(deps), as: (u: string | null) => (user = u) };
}
const req = (method: string, body?: unknown) =>
  new Request("http://x/api/me", { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });

async function seed(repo: ReturnType<typeof createMemoryRepo>, userId: string, habitId: string) {
  await repo.createHabit(userId, { id: habitId, name: "Agua", emoji: "droplet", color: "emerald", kind: "boolean", defaultAmount: 1, schedule: { type: "daily" }, aliases: [] });
  await repo.insertEntry(userId, { habitId, localDate: "2026-03-11", occurredAt: NOW, amount: 1, source: "app", clientId: habitId });
  await repo.updateSettings(userId, { telegramChatId: `chat-${userId}`, remindersEnabled: true });
  await repo.createToken(userId, "Atajos", `hash-${userId}`);
  await repo.createLinkCode(userId, `code-${userId}`, new Date(NOW.getTime() + 60_000));
  await repo.savePending(userId, `chat-${userId}`, { x: 1 });
}

describe("DELETE /api/me (eliminar cuenta)", () => {
  it("sin sesión → 401", async () => {
    const { handlers, as } = setup();
    as(null);
    expect((await handlers.deleteAccount(req("DELETE", { confirm: "ELIMINAR" }))).status).toBe(401);
  });

  it("sin la confirmación → 400 y no borra nada", async () => {
    const { handlers, repo } = setup();
    await seed(repo, "u1", H1);
    expect((await handlers.deleteAccount(req("DELETE", {}))).status).toBe(400);
    expect((await handlers.deleteAccount(req("DELETE", { confirm: "eliminar" }))).status).toBe(400);
    expect(await repo.listHabits("u1")).toHaveLength(1);
  });

  it("borra todo lo del usuario, despide por Telegram, borra Auth y no toca a otro usuario", async () => {
    const deleteAuthUser = vi.fn(async () => {});
    const sendTelegram = vi.fn(async () => {});
    const { handlers, repo } = setup({ deleteAuthUser, sendTelegram });
    await seed(repo, "u1", H1);
    await seed(repo, "u2", H2);

    const res = await handlers.deleteAccount(req("DELETE", { confirm: "ELIMINAR" }));
    expect(res.status).toBe(200);
    expect(await repo.listHabits("u1")).toEqual([]);
    expect(await repo.listEntries("u1")).toEqual([]);
    expect(await repo.listTokens("u1")).toEqual([]);
    expect(await repo.findToken("hash-u1")).toBeNull();
    expect(await repo.findUserByChat("chat-u1")).toBeNull();
    expect(await repo.consumeLinkCode("code-u1", "chat-x", NOW)).toBeNull();
    expect(deleteAuthUser).toHaveBeenCalledWith("u1");
    expect(sendTelegram).toHaveBeenCalledWith("chat-u1", expect.stringContaining("eliminó"));

    // El otro usuario sigue intacto
    expect(await repo.listHabits("u2")).toHaveLength(1);
    expect(await repo.listEntries("u2")).toHaveLength(1);
    expect(await repo.findUserByChat("chat-u2")).toBe("u2");
    expect(await repo.findToken(hashToken("x"))).toBeNull();
    expect(await repo.findToken("hash-u2")).not.toBeNull();
  });

  it("si falla Auth responde 500 con retry, y reintentar funciona (el borrado de datos es idempotente)", async () => {
    let fail = true;
    const deleteAuthUser = vi.fn(async () => {
      if (fail) throw new Error("caído");
    });
    const { handlers, repo } = setup({ deleteAuthUser });
    await seed(repo, "u1", H1);

    const first = await handlers.deleteAccount(req("DELETE", { confirm: "ELIMINAR" }));
    expect(first.status).toBe(500);
    expect((await first.json()).retry).toBe(true);
    expect(await repo.listHabits("u1")).toEqual([]);

    fail = false;
    expect((await handlers.deleteAccount(req("DELETE", { confirm: "ELIMINAR" }))).status).toBe(200);
    expect(deleteAuthUser).toHaveBeenCalledTimes(2);
  });

  it("si Telegram falla, igual se elimina la cuenta", async () => {
    const { handlers, repo } = setup({ sendTelegram: async () => Promise.reject(new Error("bot caído")) });
    await seed(repo, "u1", H1);
    expect((await handlers.deleteAccount(req("DELETE", { confirm: "ELIMINAR" }))).status).toBe(200);
  });

  it("limita los intentos por usuario", async () => {
    const { handlers } = setup({ deleteLimiter: createRateLimiter(2, 60_000) });
    for (let i = 0; i < 2; i++) expect((await handlers.deleteAccount(req("DELETE", { confirm: "ELIMINAR" }))).status).toBe(200);
    expect((await handlers.deleteAccount(req("DELETE", { confirm: "ELIMINAR" }))).status).toBe(429);
  });
});

describe("DELETE /api/me/telegram (desvincular)", () => {
  it("borra el chat y apaga los recordatorios", async () => {
    const { handlers, repo } = setup();
    await seed(repo, "u1", H1);
    expect((await handlers.unlinkTelegram(req("DELETE"))).status).toBe(200);
    const s = await repo.getSettings("u1");
    expect(s.telegramChatId).toBeUndefined();
    expect(s.remindersEnabled).toBe(false);
    expect(await repo.listReminderTargets()).toEqual([]);
  });
});

describe("nombre en la cuenta", () => {
  it("PATCH settings valida y normaliza el nombre", async () => {
    const { handlers, repo } = setup();
    expect((await handlers.patchSettings(req("PATCH", { displayName: "   " }))).status).toBe(400);
    expect((await handlers.patchSettings(req("PATCH", { displayName: "a".repeat(31) }))).status).toBe(400);
    const ok = await handlers.patchSettings(req("PATCH", { displayName: "  Facu  " }));
    expect(ok.status).toBe(200);
    const s = await repo.getSettings("u1");
    expect(s.displayName).toBe("Facu");
    expect(s.displayNameUpdatedAt).toBe(NOW.getTime());
  });

  it("sync: el nombre más nuevo gana y uno viejo no pisa", async () => {
    const { sync, repo } = setup();
    const push = (displayName: string, displayNameUpdatedAt: number) =>
      sync.push(req("POST", { settings: { timezone: "UTC", weekStartsOn: 1, displayName, displayNameUpdatedAt } }));
    expect((await push("Facu", 1000)).status).toBe(200);
    expect((await repo.getSettings("u1")).displayName).toBe("Facu");
    await push("Viejo", 500);
    expect((await repo.getSettings("u1")).displayName).toBe("Facu");
    await push("Facundo", 2000);
    const pulled = await (await sync.pull(req("GET"))).json();
    expect(pulled.settings.displayName).toBe("Facundo");
    expect(pulled.settings.displayNameUpdatedAt).toBe(2000);
  });
});
