import { weekday } from "@/lib/domain/dates";
import { parsedResponseSchema, type NLParser, type ParseContext, type ParsedItem } from "./types";

type FetchLike = typeof fetch;

const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function buildSystemPrompt(ctx: ParseContext) {
  const habits = ctx.habits.map((h) => ({
    id: h.id,
    nombre: h.name,
    alias: h.aliases,
    tipo: h.kind === "quantity" ? `cantidad (${h.unit ?? "unidades"})` : "si/no",
    cantidad_por_defecto: h.defaultAmount,
  }));
  return [
    "Sos un parser de registros de hábitos. Convertí el mensaje del usuario en registros.",
    `Hoy es ${DAY_NAMES[weekday(ctx.today)]} ${ctx.today} (zona ${ctx.timezone}). La semana empieza el lunes.`,
    "Hábitos del usuario (JSON):",
    JSON.stringify(habits),
    "Reglas:",
    '- Respondé SOLO JSON: {"items":[{"habit":string,"amount":number,"date":"YYYY-MM-DD","note":string|null}]}.',
    '- "habit": el id si coincide con un hábito (por nombre o alias), si no el texto que dijo el usuario.',
    "- Resolvé fechas relativas (ayer, el martes, anteayer) a YYYY-MM-DD. Nunca fechas futuras.",
    '- Hábitos si/no: amount 1 por cada día. Si dice "fui 3 veces esta semana", generá 3 ítems en 3 días distintos de la semana actual (hasta hoy), uno por día.',
    "- Hábitos de cantidad: amount es el número dicho (en la unidad del hábito); si no dice número, usá la cantidad por defecto.",
    "- Si no hay nada registrable devolvé items vacío. No inventes hábitos.",
  ].join("\n");
}

function normalizeItems(raw: unknown, ctx: ParseContext): ParsedItem[] {
  const parsed = parsedResponseSchema.parse(raw);
  const ids = new Set(ctx.habits.map((h) => h.id));
  return parsed.items.map((it) => ({
    ...(ids.has(it.habit) ? { habitId: it.habit } : { habitGuess: it.habit }),
    amount: it.amount,
    localDate: it.date > ctx.today ? ctx.today : it.date,
    note: it.note ?? undefined,
  }));
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned);
}

export function createGeminiParser(opts: { apiKey: string; model?: string; fetch?: FetchLike }): NLParser {
  const model = opts.model ?? "gemini-2.5-flash-lite";
  const doFetch = opts.fetch ?? fetch;
  return {
    name: `gemini:${model}`,
    async parse(text, ctx) {
      const res = await doFetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": opts.apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: buildSystemPrompt(ctx) }] },
            contents: [{ role: "user", parts: [{ text }] }],
            generationConfig: {
              temperature: 0,
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  items: {
                    type: "ARRAY",
                    items: {
                      type: "OBJECT",
                      properties: {
                        habit: { type: "STRING" },
                        amount: { type: "NUMBER" },
                        date: { type: "STRING" },
                        note: { type: "STRING", nullable: true },
                      },
                      required: ["habit", "amount", "date"],
                    },
                  },
                },
                required: ["items"],
              },
            },
          }),
        },
      );
      if (!res.ok) throw new Error(`Gemini ${res.status}`);
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const out = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!out) throw new Error("Gemini sin contenido");
      return normalizeItems(extractJson(out), ctx);
    },
  };
}

export function createGroqParser(opts: { apiKey: string; model?: string; fetch?: FetchLike }): NLParser {
  const model = opts.model ?? "openai/gpt-oss-20b";
  const doFetch = opts.fetch ?? fetch;
  return {
    name: `groq:${model}`,
    async parse(text, ctx) {
      const res = await doFetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: buildSystemPrompt(ctx) },
            { role: "user", content: text },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Groq ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const out = data.choices?.[0]?.message?.content;
      if (!out) throw new Error("Groq sin contenido");
      return normalizeItems(extractJson(out), ctx);
    },
  };
}

