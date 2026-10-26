import { createGeminiParser, createGroqParser } from "./llm";
import { rulesParser } from "./rules";
import type { NLParser, ParseContext, ParsedItem } from "./types";

/** Prueba cada parser en orden; si falla o no devuelve nada pasa al siguiente. Las reglas van siempre al final. */
export function createCompositeParser(parsers: NLParser[]): NLParser {
  return {
    name: "composite",
    async parse(text: string, ctx: ParseContext): Promise<ParsedItem[]> {
      for (const p of [...parsers, rulesParser]) {
        try {
          const items = await p.parse(text, ctx);
          if (items.length) return items;
        } catch (err) {
          console.warn(`[nl] ${p.name} falló, uso el siguiente:`, err instanceof Error ? err.message : err);
        }
      }
      return [];
    },
  };
}

/** Parser por defecto según las API keys disponibles (Gemini → Groq → reglas). */
export function getDefaultParser(env: Record<string, string | undefined> = process.env): NLParser {
  const parsers: NLParser[] = [];
  if (env.GEMINI_API_KEY) parsers.push(createGeminiParser({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL }));
  if (env.GROQ_API_KEY) parsers.push(createGroqParser({ apiKey: env.GROQ_API_KEY, model: env.GROQ_MODEL }));
  return createCompositeParser(parsers);
}

export * from "./types";
export { rulesParser } from "./rules";
