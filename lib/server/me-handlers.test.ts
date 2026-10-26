import { describe, expect, it } from "vitest";
import { createMemoryRepo } from "./memory-repo";
import { createMeHandlers } from "./me-handlers";
import { hashToken } from "./security";

const NOW = new Date("2026-03-11T12:00:00Z");

function setup(user: string | null = "u1") {
  const repo = createMemoryRepo();
  const handlers = createMeHandlers({ repo, getUserId: async () => user, now: () => NOW });
  return { repo, handlers };
}
const post = (body: unknown, url = "http://x/api/me/tokens") =>
  new Request(url, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

describe("/api/me", () => {
  it("sin sesión → 401", async () => {
    const { handlers } = setup(null);
    expect((await handlers.listTokens(new Request("http://x"))).status).toBe(401);
    expect((await handlers.createToken(post({ name: "a" }))).status).toBe(401);
  });

  it("crea token: se ve una vez, en la DB solo el hash, y no aparece al listar", async () => {
    const { handlers, repo } = setup();
    const res = await handlers.createToken(post({ name: "iPhone Atajos" }));
    const { token } = await res.json();
    expect(res.status).toBe(201);
    expect(token).toMatch(/^ht_/);
    expect(await repo.findToken(hashToken(token))).not.toBeNull();
    const list = JSON.stringify(await (await handlers.listTokens(new Request("http://x"))).json());
    expect(list).not.toContain(token);
    expect(list).not.toContain(hashToken(token));
  });

  it("revocar un token lo deja inutilizable", async () => {
    const { handlers, repo } = setup();
    const { id, token } = await (await handlers.createToken(post({ name: "t" }))).json();
    await handlers.revokeToken(new Request(`http://x/api/me/tokens?id=${id}`, { method: "DELETE" }));
    expect(await repo.findToken(hashToken(token))).toBeNull();
  });

  it("límite de tokens activos", async () => {
    const { handlers } = setup();
    for (let i = 0; i < 10; i++) await handlers.createToken(post({ name: `t${i}` }));
    expect((await handlers.createToken(post({ name: "extra" }))).status).toBe(400);
  });

  it("código de vinculación: vence en 15 min y es de un solo uso", async () => {
    const { handlers, repo } = setup();
    const { code } = await (await handlers.createLinkCode(post({}))).json();
    expect(await repo.consumeLinkCode(code, "chat-1", new Date(NOW.getTime() + 16 * 60_000))).toBeNull();
    expect(await repo.consumeLinkCode(code, "chat-1", NOW)).toBe("u1");
    expect(await repo.consumeLinkCode(code, "chat-2", NOW)).toBeNull();
  });

  it("valida settings", async () => {
    const { handlers } = setup();
    const patch = (b: unknown) => handlers.patchSettings(new Request("http://x", { method: "PATCH", body: JSON.stringify(b) }));
    expect((await patch({ reminderTime: "25:00" })).status).toBe(400);
    expect((await patch({ timezone: "Mars/Olympus" })).status).toBe(400);
    expect((await patch({ userId: "otro" })).status).toBe(400);
    const ok = await (await patch({ reminderTime: "20:30", remindersEnabled: true })).json();
    expect(ok).toMatchObject({ reminderTime: "20:30", remindersEnabled: true });
  });
});
