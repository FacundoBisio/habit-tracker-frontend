import { beforeEach, describe, expect, it } from "vitest";
import { rulesParser, type NLParser } from "@/lib/nl";
import { createMemoryRepo } from "./memory-repo";
import { createQuickHandlers } from "./quick-handlers";
import type { ServerGoal } from "./repo";
import { createRateLimiter, generateToken } from "./security";

const USER = "user-1";
// 2026-03-11 02:30 UTC = martes 10 de marzo 23:30 en Argentina
const NOW = new Date("2026-03-11T02:30:00Z");

async function setup(limit = 100, now: () => Date = () => NOW) {
  const goals: (ServerGoal & { userId: string })[] = [];
  const repo = createMemoryRepo({ goals });
  const water = await repo.createHabit(USER, { name: "Agua", emoji: "💧", color: "teal", kind: "quantity", unit: "vasos", defaultAmount: 1, schedule: { type: "daily" }, aliases: ["vaso"] });
  const gym = await repo.createHabit(USER, { name: "Gym", emoji: "🏋️", color: "blue", kind: "boolean", defaultAmount: 1, schedule: { type: "weekly", times: 3 }, aliases: ["entrené"] });
  goals.push({
    id: "g1", userId: USER, title: "Agua marzo", kind: "sum", targetValue: 4, periodStart: "2026-03-01", periodEnd: "2026-03-31", status: "active",
    links: [{ habitId: water.id, weight: 1 }],
  });
  const { token, hash } = generateToken();
  await repo.createToken(USER, "iPhone", hash);
  const handlers = createQuickHandlers({ repo, parser: rulesParser, limiter: createRateLimiter(limit, 60_000), now });
  return { repo, handlers, token, water, gym };
}

const req = (path: string, token: string | null, body?: unknown, extra = "") =>
  new Request(`http://localhost/api/quick/${path}${extra}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("/api/quick auth y rate limit", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { ctx = await setup(); });

  it("sin token o con token inválido → 401", async () => {
    expect((await ctx.handlers.habits(req("habits", null))).status).toBe(401);
    expect((await ctx.handlers.habits(req("habits", "ht_falso"))).status).toBe(401);
  });

  it("token revocado → 401", async () => {
    const [t] = await ctx.repo.listTokens(USER);
    await ctx.repo.revokeToken(USER, t.id);
    expect((await ctx.handlers.habits(req("habits", ctx.token))).status).toBe(401);
  });

  it("rate limit por token → 429 con retry-after", async () => {
    const limited = await setup(2);
    await limited.handlers.habits(req("habits", limited.token));
    await limited.handlers.habits(req("habits", limited.token));
    const res = await limited.handlers.habits(req("habits", limited.token));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
  });

  it("lista hábitos en JSON y en texto plano", async () => {
    const json = await (await ctx.handlers.habits(req("habits", ctx.token))).json();
    expect(json.habits.map((h: { name: string }) => h.name)).toEqual(["Agua", "Gym"]);
    const text = await (await ctx.handlers.habits(req("habits", ctx.token, undefined, "?format=text"))).text();
    expect(text).toBe("Agua\nGym");
  });
});

describe("POST /api/quick/log", () => {
  it("registra por alias y usa la fecha local Argentina (23:30 no salta de día)", async () => {
    const { handlers, token, repo } = await setup();
    const res = await handlers.log(req("log", token, { habit: "vaso", amount: 2 }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.text).toContain("Agua +2 vasos");
    expect(json.text).toContain("Agua marzo 50%");
    const [e] = await repo.listEntries(USER);
    expect(e.localDate).toBe("2026-03-10");
    expect(e.source).toBe("shortcut");
  });

  it("idempotente por client_id: reintento no duplica", async () => {
    const { handlers, token, repo } = await setup();
    const client_id = "11111111-1111-4111-8111-111111111111";
    await handlers.log(req("log", token, { habit: "agua", client_id }));
    const second = await (await handlers.log(req("log", token, { habit: "agua", client_id }))).json();
    expect(second.duplicate).toBe(true);
    expect(await repo.listEntries(USER)).toHaveLength(1);
  });

  it("completa el objetivo y lo informa", async () => {
    const { handlers, token } = await setup();
    const json = await (await handlers.log(req("log", token, { habit: "agua", amount: 4 }))).json();
    expect(json.completed_goals).toEqual(["Agua marzo"]);
    expect(json.text).toContain("🎉 Objetivo completado");
  });

  it("weekly muestra x/y de la semana", async () => {
    const { handlers, token } = await setup();
    const json = await (await handlers.log(req("log", token, { habit: "gym" }))).json();
    expect(json.text).toContain("semana 1/3");
  });

  it("errores: hábito inexistente 404, fecha futura 400, body inválido 400", async () => {
    const { handlers, token } = await setup();
    expect((await handlers.log(req("log", token, { habit: "yoga" }))).status).toBe(404);
    expect((await handlers.log(req("log", token, { habit: "agua", date: "2026-04-01" }))).status).toBe(400);
    expect((await handlers.log(req("log", token, { amount: 1 }))).status).toBe(400);
  });

  it("date: rechaza más de un año atrás y más allá de mañana; acepta hace un año y mañana", async () => {
    const { handlers, token, repo } = await setup();
    // hoy local = 2026-03-10
    const old = await handlers.log(req("log", token, { habit: "agua", date: "2025-03-08" }));
    expect(old.status).toBe(400);
    expect((await old.json()).text).toContain("más de un año");
    expect((await handlers.log(req("log", token, { habit: "agua", date: "2026-03-12" }))).status).toBe(400);
    expect((await handlers.log(req("log", token, { habit: "agua", date: "2025-03-10" }))).status).toBe(200);
    expect((await handlers.log(req("log", token, { habit: "agua", date: "2026-03-11" }))).status).toBe(200);
    expect(await repo.listEntries(USER)).toHaveLength(2);
  });

  it("cuerpo > 16 KB → 413 (por content-length o por lo leído) y no escribe", async () => {
    const { handlers, token, repo } = await setup();
    const big = { habit: "agua", note: "x".repeat(17_000) };
    const declared = await handlers.log(req("log", token, big));
    expect(declared.status).toBe(413);

    // Sin content-length (stream): se corta al leer.
    const bytes = new TextEncoder().encode(JSON.stringify({ text: "agua 1", confirm: true, pad: "y".repeat(20_000) }));
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 1024) c.enqueue(bytes.slice(i, i + 1024));
        c.close();
      },
    });
    const streamed = new Request("http://localhost/api/quick/ingest", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: stream,
      duplex: "half",
    } as RequestInit);
    expect(streamed.headers.get("content-length")).toBeNull();
    expect((await handlers.ingest(streamed)).status).toBe(413);

    // Un content-length mentiroso (chico) tampoco alcanza: cuenta lo leído.
    const lying = new Request("http://localhost/api/quick/log", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "content-length": "10" },
      body: JSON.stringify(big),
    });
    expect((await handlers.log(lying)).status).toBe(413);
    expect(await repo.listEntries(USER)).toHaveLength(0);
  });

  it("devuelve texto plano si se pide", async () => {
    const { handlers, token } = await setup();
    const res = await handlers.log(req("log", token, { habit: "gym" }, "?format=text"));
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toContain("Gym");
  });
});

describe("POST /api/quick/ingest", () => {
  it("confirm=false solo dice qué entendió y no escribe", async () => {
    const { handlers, token, repo } = await setup();
    const json = await (await handlers.ingest(req("ingest", token, { text: "agua 3, gym", confirm: false }))).json();
    expect(json.registered).toBe(false);
    expect(json.text).toContain("Entendí:");
    expect(json.understood).toHaveLength(2);
    expect(await repo.listEntries(USER)).toHaveLength(0);
  });

  it("confirm=true registra y es idempotente con el mismo client_id", async () => {
    const { handlers, token, repo } = await setup();
    const body = { text: "agua 3, gym", confirm: true, client_id: "22222222-2222-4222-8222-222222222222" };
    await handlers.ingest(req("ingest", token, body));
    await handlers.ingest(req("ingest", token, body));
    expect(await repo.listEntries(USER)).toHaveLength(2);
  });

  it("sin client_id: el mismo texto dos veces el mismo día (separado >60 s) registra dos veces", async () => {
    let now = NOW;
    const { handlers, token, repo } = await setup(100, () => now);
    await handlers.ingest(req("ingest", token, { text: "agua 1", confirm: true }));
    now = new Date(NOW.getTime() + 5 * 60_000);
    const json = await (await handlers.ingest(req("ingest", token, { text: "agua 1", confirm: true }))).json();
    expect(json.text).not.toContain("ya estaba registrado");
    expect(await repo.listEntries(USER)).toHaveLength(2);
  });

  it("sin client_id: un reintento inmediato (mismo minuto) no duplica", async () => {
    let now = NOW;
    const { handlers, token, repo } = await setup(100, () => now);
    await handlers.ingest(req("ingest", token, { text: "agua 1", confirm: true }));
    now = new Date(NOW.getTime() + 10_000);
    const json = await (await handlers.ingest(req("ingest", token, { text: "agua 1", confirm: true }))).json();
    expect(json.text).toContain("ya estaba registrado");
    expect(await repo.listEntries(USER)).toHaveLength(1);
  });

  it("más de 5 ítems: confirm=true no alcanza, hace falta el confirm_token de la vista previa", async () => {
    const { repo, token, water } = await setup();
    const n = { count: 6 };
    const parser: NLParser = {
      name: "fake-llm",
      parse: async () => Array.from({ length: n.count }, (_, i) => ({ habitId: water.id, amount: 1, localDate: `2026-03-0${i + 1}` })),
    };
    const handlers = createQuickHandlers({ repo, parser, limiter: createRateLimiter(100, 60_000), now: () => NOW });

    const first = await (await handlers.ingest(req("ingest", token, { text: "muchos", confirm: true }))).json();
    expect(first.registered).toBe(false);
    expect(first.needs_confirmation).toBe(true);
    expect(first.confirm_token).toEqual(expect.any(String));
    expect(await repo.listEntries(USER)).toHaveLength(0);

    const bad = await (await handlers.ingest(req("ingest", token, { text: "muchos", confirm: true, confirm_token: "nope" }))).json();
    expect(bad.registered).toBe(false);

    // La vista previa (confirm=false) también trae el token.
    const preview = await (await handlers.ingest(req("ingest", token, { text: "muchos", confirm: false }))).json();
    expect(preview.confirm_token).toBe(first.confirm_token);

    const ok = await (await handlers.ingest(req("ingest", token, { text: "muchos", confirm: true, confirm_token: first.confirm_token }))).json();
    expect(ok.registered).toBe(true);
    expect(await repo.listEntries(USER)).toHaveLength(6);

    // Si en el reintento el parser entiende otra cosa, el token viejo ya no sirve.
    n.count = 7;
    const changed = await (await handlers.ingest(req("ingest", token, { text: "muchos", confirm: true, confirm_token: first.confirm_token }))).json();
    expect(changed.registered).toBe(false);
  });

  it("5 ítems o menos registran directo con confirm=true", async () => {
    const { repo, token, water } = await setup();
    const parser: NLParser = {
      name: "fake-llm",
      parse: async () => Array.from({ length: 5 }, (_, i) => ({ habitId: water.id, amount: 1, localDate: `2026-03-0${i + 1}` })),
    };
    const handlers = createQuickHandlers({ repo, parser, limiter: createRateLimiter(100, 60_000), now: () => NOW });
    const json = await (await handlers.ingest(req("ingest", token, { text: "cinco", confirm: true }))).json();
    expect(json.registered).toBe(true);
    expect(await repo.listEntries(USER)).toHaveLength(5);
  });

  it("informa hábitos que no matchean", async () => {
    const { handlers, token } = await setup();
    const json = await (await handlers.ingest(req("ingest", token, { text: "yoga 15", confirm: false }))).json();
    expect(json.unmatched[0].term).toBe("yoga");
    expect(json.text).toContain("No pude registrar nada");
  });
});
