import { describe, expect, it, vi } from "vitest";
import { createCompositeParser } from "./index";
import { createGeminiParser, createGroqParser } from "./llm";
import { rulesParser } from "./rules";
import { resolveItems, type ParseContext } from "./types";
import type { ServerHabit } from "@/lib/server/repo";

// 2026-03-11 es miércoles
const ctx: ParseContext = {
  today: "2026-03-11",
  timezone: "America/Argentina/Cordoba",
  habits: [
    { id: "agua", name: "Agua", aliases: ["vaso"], kind: "quantity", unit: "vasos", defaultAmount: 1 },
    { id: "gym", name: "Gym", aliases: ["entrené", "pesas"], kind: "boolean", unit: undefined, defaultAmount: 1 },
    { id: "leer", name: "Leer", aliases: ["leí"], kind: "quantity", unit: "min", defaultAmount: 20 },
  ],
};

describe("rulesParser", () => {
  it("agua 3 → cantidad", async () => {
    expect(await rulesParser.parse("agua 3", ctx)).toEqual([{ habitId: "agua", amount: 3, localDate: "2026-03-11" }]);
  });
  it("gym sin número → 1", async () => {
    expect(await rulesParser.parse("gym", ctx)).toEqual([{ habitId: "gym", amount: 1, localDate: "2026-03-11" }]);
  });
  it("leí 20 min vía alias", async () => {
    const [it] = await rulesParser.parse("leí 20 min", ctx);
    expect(it).toMatchObject({ habitId: "leer", amount: 20 });
  });
  it("sin número usa la cantidad por defecto del hábito", async () => {
    const [it] = await rulesParser.parse("leí", ctx);
    expect(it.amount).toBe(20);
  });
  it("ayer y días de la semana", async () => {
    expect((await rulesParser.parse("ayer gym", ctx))[0].localDate).toBe("2026-03-10");
    expect((await rulesParser.parse("el lunes gym", ctx))[0].localDate).toBe("2026-03-09");
    expect((await rulesParser.parse("gym el miércoles", ctx))[0].localDate).toBe("2026-03-11");
  });
  it("varios ítems separados por coma o 'y'", async () => {
    const items = await rulesParser.parse("agua 2, gym y leí 10 min", ctx);
    expect(items.map((i) => i.habitId)).toEqual(["agua", "gym", "leer"]);
  });
  it("hábito desconocido → habitGuess", async () => {
    expect(await rulesParser.parse("yoga 15", ctx)).toEqual([{ habitGuess: "yoga", amount: 15, localDate: "2026-03-11" }]);
  });
});

const okJson = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe("parsers LLM (fetch mockeado)", () => {
  const items = { items: [{ habit: "gym", amount: 1, date: "2026-03-09" }, { habit: "yoga", amount: 1, date: "2026-03-20" }] };

  it("Gemini: mapea ids, deja habitGuess y recorta fechas futuras", async () => {
    const f = vi.fn(() => okJson({ candidates: [{ content: { parts: [{ text: JSON.stringify(items) }] } }] }));
    const out = await createGeminiParser({ apiKey: "k", fetch: f as unknown as typeof fetch }).parse("x", ctx);
    expect(out[0]).toMatchObject({ habitId: "gym", localDate: "2026-03-09" });
    expect(out[1]).toMatchObject({ habitGuess: "yoga", localDate: "2026-03-11" });
    const headers = (f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers["x-goog-api-key"]).toBe("k");
  });

  it("Groq: acepta JSON dentro de bloque de código", async () => {
    const f = vi.fn(() => okJson({ choices: [{ message: { content: "```json\n" + JSON.stringify(items) + "\n```" } }] }));
    const out = await createGroqParser({ apiKey: "k", fetch: f as unknown as typeof fetch }).parse("x", ctx);
    expect(out).toHaveLength(2);
  });

  it("error HTTP lanza", async () => {
    const f = vi.fn(() => Promise.resolve(new Response("", { status: 429 })));
    await expect(createGeminiParser({ apiKey: "k", fetch: f as unknown as typeof fetch }).parse("x", ctx)).rejects.toThrow("429");
  });

  it("JSON inválido lanza", async () => {
    const f = vi.fn(() => okJson({ choices: [{ message: { content: '{"items":[{"habit":1}]}' } }] }));
    await expect(createGroqParser({ apiKey: "k", fetch: f as unknown as typeof fetch }).parse("x", ctx)).rejects.toThrow();
  });
});

describe("compuesto", () => {
  it("si el LLM falla cae al parser por reglas", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const broken = { name: "broken", parse: async () => { throw new Error("cuota"); } };
    const out = await createCompositeParser([broken]).parse("agua 3", ctx);
    expect(out[0]).toMatchObject({ habitId: "agua", amount: 3 });
  });
});

describe("resolveItems", () => {
  const habits = ctx.habits.map((h, i) => ({ ...h, emoji: "x", color: "teal", schedule: { type: "daily" as const }, archived: false, sortOrder: i })) as ServerHabit[];
  it("separa resueltos y sin match", () => {
    const r = resolveItems(
      [
        { habitId: "gym", amount: 1, localDate: "2026-03-11" },
        { habitGuess: "pesas", amount: 1, localDate: "2026-03-11" },
        { habitGuess: "yoga", amount: 5, localDate: "2026-03-11" },
      ],
      habits,
    );
    expect(r.resolved.map((x) => x.habit.id)).toEqual(["gym", "gym"]);
    expect(r.unmatched).toEqual([{ term: "yoga", amount: 5, localDate: "2026-03-11" }]);
  });
});
