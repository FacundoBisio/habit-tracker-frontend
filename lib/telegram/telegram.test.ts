import { beforeEach, describe, expect, it } from "vitest";
import { rulesParser, type NLParser } from "@/lib/nl";
import { createMemoryRepo } from "@/lib/server/memory-repo";
import type { ServerGoal } from "@/lib/server/repo";
import { createRateLimiter } from "@/lib/server/security";
import type { InlineButton, ReplyMarkup, TelegramClient, TelegramUpdate } from "./api";
import { handleUpdate, type BotDeps } from "./handler";
import { MAINTENANCE_UTC_HOUR, PENDING_TTL_MS, runCronTick, runReminders } from "./reminders";
import { handleWebhook, isCronAuthorized } from "./webhook";

const USER = "user-1";
const CHAT = "555";
// martes 10/3/2026 23:30 en Argentina (miércoles 11 02:30 UTC)
const NOW = new Date("2026-03-11T02:30:00Z");

interface Sent {
  kind: "send" | "edit";
  text: string;
  markup?: ReplyMarkup;
}

function fakeTelegram() {
  const sent: Sent[] = [];
  const answers: (string | undefined)[] = [];
  const tg: TelegramClient = {
    async sendMessage(_c, text, markup) { sent.push({ kind: "send", text, markup }); },
    async editMessage(_c, _m, text, markup) { sent.push({ kind: "edit", text, markup }); },
    async answerCallback(_id, text) { answers.push(text); },
  };
  return { tg, sent, answers, last: () => sent[sent.length - 1] };
}

async function setup(parser: NLParser = rulesParser, linked = true) {
  const goals: (ServerGoal & { userId: string })[] = [];
  const repo = createMemoryRepo({ goals });
  const water = await repo.createHabit(USER, { name: "Agua", emoji: "💧", color: "teal", kind: "quantity", unit: "vasos", defaultAmount: 1, schedule: { type: "daily" }, aliases: [] });
  const gym = await repo.createHabit(USER, { name: "Gym", emoji: "🏋️", color: "blue", kind: "boolean", defaultAmount: 1, schedule: { type: "weekly", times: 3 }, aliases: ["pesas"] });
  goals.push({ id: "g1", userId: USER, title: "Gym 3x/sem", kind: "frequency", targetValue: 3, periodStart: "2026-03-09", periodEnd: "2026-03-15", status: "active", links: [{ habitId: gym.id, weight: 1 }] });
  if (linked) await repo.updateSettings(USER, { telegramChatId: CHAT });
  const t = fakeTelegram();
  const deps: BotDeps = { repo, parser, tg: t.tg, now: () => NOW, linkLimiter: createRateLimiter(5, 60_000) };
  const say = (text: string, chat = CHAT) => handleUpdate({ message: { message_id: 1, chat: { id: chat }, text } }, deps);
  const press = (data: string, chat = CHAT) =>
    handleUpdate({ callback_query: { id: "cb", data, message: { message_id: 9, chat: { id: chat } } } }, deps);
  const buttons = (): InlineButton[] => {
    const m = t.last().markup;
    return m && "inline_keyboard" in m ? m.inline_keyboard.flat() : [];
  };
  const button = (prefix: string) => buttons().find((b) => b.text.startsWith(prefix))!.callback_data;
  return { repo, water, gym, deps, say, press, buttons, button, goals, ...t };
}

describe("vinculación", () => {
  it("sin vincular solo responde cómo vincular", async () => {
    const s = await setup(rulesParser, false);
    await s.say("agua 3");
    expect(s.last().text).toContain("/vincular");
    expect(await s.repo.listEntries(USER)).toHaveLength(0);
  });

  it("vincula con código válido de un solo uso", async () => {
    const s = await setup(rulesParser, false);
    await s.repo.createLinkCode(USER, "ABC123", new Date(NOW.getTime() + 60_000));
    await s.say("/vincular abc123", "777");
    expect(s.sent[0].text).toContain("vinculada");
    expect(await s.repo.findUserByChat("777")).toBe(USER);
    await s.say("/vincular ABC123", "888");
    expect(s.last().text).toContain("inválido");
  });

  it("limita intentos de código", async () => {
    const s = await setup(rulesParser, false);
    for (let i = 0; i < 6; i++) await s.say("/vincular NOPE00");
    expect(s.last().text).toContain("Demasiados intentos");
  });
});

describe("registro con confirmación", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => { s = await setup(); });

  it("resume, confirma con botones y recién ahí escribe", async () => {
    await s.say("agua 3");
    expect(s.last().text).toContain("Agua +3 vasos");
    expect(s.buttons().map((b) => b.text)).toEqual(["✅ Confirmar", "✏️ Corregir", "❌ Cancelar"]);
    expect(await s.repo.listEntries(USER)).toHaveLength(0);

    await s.press(s.button("✅"));
    const [e] = await s.repo.listEntries(USER);
    expect(e).toMatchObject({ amount: 3, source: "bot", localDate: "2026-03-10", rawInput: "agua 3" });
    expect(s.last().kind).toBe("edit");
    expect(s.last().text).toContain("Agua +3 vasos");
  });

  it("un doble toque en Confirmar no duplica", async () => {
    await s.say("agua 3");
    const confirm = s.button("✅");
    await s.press(confirm);
    await s.press(confirm);
    expect(await s.repo.listEntries(USER)).toHaveLength(1);
    expect(s.answers.at(-1)).toContain("ya no está disponible");
  });

  it("cancelar y corregir no escriben", async () => {
    await s.say("agua 3");
    await s.press(s.button("❌"));
    await s.say("agua 2");
    await s.press(s.button("✏️"));
    expect(await s.repo.listEntries(USER)).toHaveLength(0);
    expect(s.last().text).toContain("de nuevo");
  });

  it("otro chat no puede confirmar la pendiente", async () => {
    await s.say("agua 3");
    const confirm = s.button("✅");
    await s.repo.updateSettings("otro", { telegramChatId: "999" });
    await s.press(confirm, "999");
    expect(await s.repo.listEntries(USER)).toHaveLength(0);
  });

  it("toque en el teclado (nombre exacto) registra directo y permite deshacer", async () => {
    await s.say("Agua");
    expect(await s.repo.listEntries(USER)).toHaveLength(1);
    await s.press(s.button("↩️"));
    expect(await s.repo.listEntries(USER)).toHaveLength(0);
    expect(s.last().text).toContain("deshecho");
  });

  it("reintento del webhook (mismo update_id) en un toque de teclado no duplica", async () => {
    const update: TelegramUpdate = { update_id: 4242, message: { message_id: 1, chat: { id: CHAT }, text: "Agua" } };
    await handleUpdate(update, s.deps);
    await handleUpdate(update, s.deps);
    expect(await s.repo.listEntries(USER)).toHaveLength(1);
    // Otro update con el mismo texto sí es un registro nuevo.
    await handleUpdate({ ...update, update_id: 4243 }, s.deps);
    expect(await s.repo.listEntries(USER)).toHaveLength(2);
  });

  it("reintento del webhook de un texto libre: confirmar ambas pendientes registra una sola vez", async () => {
    const update: TelegramUpdate = { update_id: 77, message: { message_id: 1, chat: { id: CHAT }, text: "agua 3" } };
    await handleUpdate(update, s.deps);
    const first = s.button("✅");
    await handleUpdate(update, s.deps);
    const second = s.button("✅");
    expect(second).not.toBe(first);
    await s.press(first);
    await s.press(second);
    expect(await s.repo.listEntries(USER)).toHaveLength(1);
  });

  it("reintento del mismo callback de Confirmar no duplica", async () => {
    await s.say("agua 3");
    const cb: TelegramUpdate = { update_id: 90, callback_query: { id: "cb", data: s.button("✅"), message: { message_id: 9, chat: { id: CHAT } } } };
    await handleUpdate(cb, s.deps);
    await handleUpdate(cb, s.deps);
    expect(await s.repo.listEntries(USER)).toHaveLength(1);
  });

  it("un lote grande del parser (> 5 ítems) nunca se registra sin Confirmar", async () => {
    const parser: NLParser = {
      name: "fake-llm",
      parse: async (_t, c) => Array.from({ length: 8 }, () => ({ habitId: c.habits[0].id, amount: 1, localDate: "2026-03-10" })),
    };
    const t = await setup(parser);
    await t.say("cualquier cosa");
    expect(await t.repo.listEntries(USER)).toHaveLength(0);
    expect(t.buttons().some((b) => b.text.startsWith("✅"))).toBe(true);
  });

  it("completar un objetivo avisa en el resultado y /deshacer lo reabre", async () => {
    const parser: NLParser = {
      name: "fake-llm",
      parse: async (_t, ctx) => {
        const gym = ctx.habits.find((h) => h.name === "Gym")!;
        return ["2026-03-09", "2026-03-10", "2026-03-10"].map((localDate) => ({ habitId: gym.id, amount: 1, localDate }));
      },
    };
    const t = await setup(parser);
    await t.say("esta semana fui 3 veces al gym");
    // 3 ítems pero solo 2 días distintos: no alcanza para el objetivo
    await t.press(t.button("✅"));
    expect(t.goals[0].status).toBe("active");
    await t.repo.insertEntry(USER, { habitId: t.gym.id, amount: 1, localDate: "2026-03-11", occurredAt: new Date(NOW.getTime() + 1000), source: "app", clientId: "c1" });
    await t.say("/hoy");
    await t.say("/objetivos");
    expect(t.last().text).toContain("Gym 3x/sem");
  });

  it("objetivo completo se informa y se reabre al deshacer", async () => {
    const t = await setup();
    t.goals[0].kind = "count";
    for (const i of [0, 1]) {
      await t.repo.insertEntry(USER, { habitId: t.gym.id, amount: 1, localDate: "2026-03-09", occurredAt: new Date(NOW.getTime() - 86_400_000 + i), source: "app", clientId: `p${i}` });
    }
    await t.say("gym");
    // "gym" es un nombre exacto: registra directo, sin confirmación
    expect(t.goals[0].status).toBe("completed");
    expect(t.last().text).toContain("🎉 Objetivo completado: Gym 3x/sem");
    await t.say("/deshacer");
    expect(t.goals[0].status).toBe("active");
    expect(t.last().text).toContain("Deshice 1 registro");
  });

  it("objetivo completo vía confirmación con varios ítems", async () => {
    const t = await setup();
    t.goals[0].kind = "count";
    await t.repo.insertEntry(USER, { habitId: t.gym.id, amount: 1, localDate: "2026-03-09", occurredAt: new Date(NOW.getTime() - 86_400_000), source: "app", clientId: "p0" });
    await t.say("gym ayer, pesas hoy");
    await t.press(t.button("✅"));
    expect(t.goals[0].status).toBe("completed");
    expect(t.last().text).toContain("🎉 Objetivo completado: Gym 3x/sem");
    await t.say("/deshacer");
    expect(t.goals[0].status).toBe("active");
    expect(t.last().text).toContain("Deshice 2 registros"); // deshace todo el lote del mismo mensaje
  });
});

describe("hábitos que no matchean", () => {
  it("crear hábito nuevo y seguir con la confirmación", async () => {
    const s = await setup();
    await s.say("yoga 15");
    expect(s.buttons().some((b) => b.text.startsWith("➕ Crear"))).toBe(true);
    await s.press(s.button("➕"));
    const habits = await s.repo.listHabits(USER);
    expect(habits.find((h) => h.name === "Yoga")).toMatchObject({ kind: "quantity", defaultAmount: 15 });
    await s.press(s.button("✅"));
    expect(await s.repo.listEntries(USER)).toHaveLength(1);
  });

  it("guardar el término como alias de un hábito existente", async () => {
    const s = await setup();
    await s.say("fierros");
    await s.press(s.button("🔗 “fierros” es Gym"));
    const gym = (await s.repo.listHabits(USER)).find((h) => h.name === "Gym")!;
    expect(gym.aliases).toContain("fierros");
    await s.press(s.button("✅"));
    expect((await s.repo.listEntries(USER))[0].habitId).toBe(gym.id);
  });
});

describe("comandos", () => {
  it("/hoy /semana /objetivos", async () => {
    const s = await setup();
    await s.say("/hoy");
    expect(s.last().text).toContain("⬜ 💧 Agua");
    await s.say("/semana");
    expect(s.last().text).toContain("🗓 Semana");
    await s.say("/objetivos");
    expect(s.last().text).toContain("Gym 3x/sem");
  });

  it("/recordatorios configura hora y estado", async () => {
    const s = await setup();
    await s.say("/recordatorios 20:30");
    expect(await s.repo.getSettings(USER)).toMatchObject({ reminderTime: "20:30", remindersEnabled: true });
    await s.say("/recordatorios off");
    expect((await s.repo.getSettings(USER)).remindersEnabled).toBe(false);
    await s.say("/recordatorios mañana");
    expect(s.last().text).toContain("Usá:");
  });

  it("/start de un usuario vinculado manda el teclado con hábitos", async () => {
    const s = await setup();
    await s.say("/start");
    const m = s.last().markup;
    expect(m && "keyboard" in m ? m.keyboard.flat().map((k) => k.text) : []).toEqual(expect.arrayContaining(["Agua", "Gym"]));
  });
});

describe("webhook y recordatorios", () => {
  const update: TelegramUpdate = { message: { message_id: 1, chat: { id: CHAT }, text: "/hoy" } };
  const post = (secret?: string) =>
    new Request("http://x/api/telegram", {
      method: "POST",
      headers: secret ? { "x-telegram-bot-api-secret-token": secret } : {},
      body: JSON.stringify(update),
    });

  it("rechaza sin secret_token o con uno incorrecto", async () => {
    const s = await setup();
    expect((await handleWebhook(post(), s.deps, "s3cret")).status).toBe(403);
    expect((await handleWebhook(post("otro"), s.deps, "s3cret")).status).toBe(403);
    expect((await handleWebhook(post("s3cret"), s.deps, undefined)).status).toBe(403);
    expect(s.sent).toHaveLength(0);
  });

  it("procesa con el secret correcto y responde 200 aunque falle el handler", async () => {
    const s = await setup();
    expect((await handleWebhook(post("s3cret"), s.deps, "s3cret")).status).toBe(200);
    expect(s.sent).toHaveLength(1);
    const broken = { ...s.deps, repo: { ...s.deps.repo, findUserByChat: async () => { throw new Error("db caída"); } } };
    expect((await handleWebhook(post("s3cret"), broken, "s3cret")).status).toBe(200);
  });

  it("cron: autorización por Bearer", () => {
    const r = (h: string) => new Request("http://x", { headers: { authorization: h } });
    expect(isCronAuthorized(r("Bearer abc"), "abc")).toBe(true);
    expect(isCronAuthorized(r("Bearer abd"), "abc")).toBe(false);
    expect(isCronAuthorized(r("Bearer abc"), undefined)).toBe(false);
  });

  it("recordatorio solo a la hora configurada (en la zona del usuario) y con pendientes", async () => {
    const s = await setup();
    await s.repo.updateSettings(USER, { remindersEnabled: true, reminderTime: "23:30" });
    expect(await runReminders({ repo: s.repo, tg: s.tg, now: () => NOW })).toBe(1);
    expect(s.last().text).toContain("Te falta hoy");
    expect(s.last().text).toContain("Agua");
    // un minuto después ya se mandó hoy: no se repite
    expect(await runReminders({ repo: s.repo, tg: s.tg, now: () => new Date(NOW.getTime() + 60_000) })).toBe(0);
  });

  it("si el cron se atrasa o se pierde ese minuto, avisa igual (hasta 2 h tarde) y una sola vez por día", async () => {
    const s = await setup();
    // NOW es 23:30 en Argentina: hora configurada 23:20 → el cron llegó 10 minutos tarde
    await s.repo.updateSettings(USER, { remindersEnabled: true, reminderTime: "23:20" });
    const run = (ms: number) => runReminders({ repo: s.repo, tg: s.tg, now: () => new Date(NOW.getTime() + ms) });
    expect(await run(0)).toBe(1);
    expect(await run(5 * 60_000)).toBe(0);
    // al día siguiente vuelve a avisar
    expect(await run(86_400_000)).toBe(1);
  });

  it("no avisa antes de la hora ni con más de 2 h de atraso", async () => {
    const s = await setup();
    const run = () => runReminders({ repo: s.repo, tg: s.tg, now: () => NOW });
    await s.repo.updateSettings(USER, { remindersEnabled: true, reminderTime: "23:45" });
    expect(await run()).toBe(0);
    await s.repo.updateSettings(USER, { reminderTime: "21:00" });
    expect(await run()).toBe(0);
  });

  it("no manda recordatorio si no falta nada; domingo manda resumen semanal", async () => {
    const s = await setup();
    await s.repo.updateSettings(USER, { remindersEnabled: true, reminderTime: "21:00" });
    await s.repo.insertEntry(USER, { habitId: s.water.id, amount: 1, localDate: "2026-03-15", occurredAt: NOW, source: "app", clientId: "w1" });
    await s.repo.insertEntry(USER, { habitId: s.gym.id, amount: 1, localDate: "2026-03-15", occurredAt: NOW, source: "app", clientId: "g1" });
    // domingo 15/3 21:00 Argentina = lunes 16 00:00 UTC
    const sunday = new Date("2026-03-16T00:00:00Z");
    expect(await runReminders({ repo: s.repo, tg: s.tg, now: () => sunday })).toBe(1);
    expect(s.sent.some((m) => m.text.includes("Te falta hoy"))).toBe(false);
    expect(s.last().text).toContain("Resumen de la semana");
  });
});

describe("mantenimiento diario (cron)", () => {
  // La memoria fecha las pendientes con el reloj real: el test usa el reloj real también.
  const DAY = 86_400_000;

  it("purgeStale borra códigos vencidos o usados y pendientes viejas; deja lo vigente", async () => {
    const repo = createMemoryRepo();
    const now = new Date();
    await repo.createLinkCode("u1", "OLD111", new Date(now.getTime() - 60_000));
    await repo.createLinkCode("u1", "USED22", new Date(now.getTime() + 10 * 60_000));
    await repo.consumeLinkCode("USED22", "c1", now);
    await repo.createLinkCode("u2", "LIVE33", new Date(now.getTime() + 10 * 60_000));
    const pid = await repo.savePending("u1", "c1", { rawInput: "agua" });

    expect(await repo.purgeStale({ now, pendingBefore: new Date(now.getTime() - PENDING_TTL_MS) })).toEqual({ linkCodes: 2, pending: 0 });
    // El código vigente sigue sirviendo y la pendiente reciente también.
    expect(await repo.consumeLinkCode("LIVE33", "c2", now)).toBe("u2");
    const later = new Date(now.getTime() + PENDING_TTL_MS + DAY);
    expect(await repo.purgeStale({ now: later, pendingBefore: new Date(later.getTime() - PENDING_TTL_MS) })).toEqual({ linkCodes: 1, pending: 1 });
    expect(await repo.takePending(pid, "c1")).toBeNull();
  });

  it("el tick del cron purga solo en el minuto de mantenimiento diario", async () => {
    const repo = createMemoryRepo();
    const t = fakeTelegram();
    const base = new Date();
    await repo.savePending("u1", "c1", {});
    // Un minuto cualquiera (no el de mantenimiento) varios días después: no purga.
    const offMinute = new Date(base.getTime() + 3 * DAY);
    offMinute.setUTCHours(MAINTENANCE_UTC_HOUR, 1, 0, 0);
    expect((await runCronTick({ repo, tg: t.tg, now: () => offMinute })).purged).toBeNull();
    // El minuto de mantenimiento: purga.
    const onMinute = new Date(offMinute);
    onMinute.setUTCMinutes(0);
    expect((await runCronTick({ repo, tg: t.tg, now: () => onMinute })).purged).toEqual({ linkCodes: 0, pending: 1 });
  });
});
