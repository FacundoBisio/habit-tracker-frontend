import { addDays, weekday } from "@/lib/domain/dates";
import { normalize } from "@/lib/domain/match";
import type { NLParser, ParseContext, ParsedItem } from "./types";

const NUMBER_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
};

const WEEKDAYS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
};

const FILLER = new Set([
  "hoy", "ayer", "anteayer", "antes", "de", "del", "el", "la", "los", "las", "un", "una", "al", "a", "en", "mi", "me",
  "con", "fui", "hice", "hize", "tome", "hizo", "vez", "veces", "min", "mins", "minutos", "minuto", "hs", "horas", "hora",
  "km", "kms", "kilometros", "vasos", "vaso", "paginas", "pagina", "cap", "capitulos", "capitulo", "lunes", "martes",
  "miercoles", "jueves", "viernes", "sabado", "domingo", "y", "e", "que", "por", "esta", "semana",
]);

function detectDate(n: string, today: string): string {
  if (/\banteayer\b|\bantes de ayer\b/.test(n)) return addDays(today, -2);
  if (/\bayer\b/.test(n)) return addDays(today, -1);
  for (const [name, idx] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(n)) {
      const back = (weekday(today) - idx + 7) % 7;
      return addDays(today, -back); // el día más reciente (hoy incluido)
    }
  }
  return today;
}

function detectAmount(n: string): number | undefined {
  const digits = n.match(/\d+(?:[.,]\d+)?/);
  if (digits) return Number(digits[0].replace(",", "."));
  for (const tok of n.split(" ")) if (tok in NUMBER_WORDS) return NUMBER_WORDS[tok];
  return undefined;
}

/** Parser por reglas: fallback sin LLM para frases cortas ("agua 3", "gym", "leí 20 min", "ayer gym"). */
export const rulesParser: NLParser = {
  name: "rules",
  async parse(text: string, ctx: ParseContext): Promise<ParsedItem[]> {
    const segments = text.split(/[,;\n]| y /i).map((s) => s.trim()).filter(Boolean);
    const items: ParsedItem[] = [];

    for (const seg of segments) {
      const n = normalize(seg);
      if (!n) continue;
      const padded = ` ${n} `;

      // Habit cuyo nombre/alias aparece como palabra/frase completa; gana la etiqueta más larga.
      let best: { habit: ParseContext["habits"][number]; len: number } | undefined;
      for (const habit of ctx.habits) {
        for (const label of [habit.name, ...habit.aliases].map(normalize).filter(Boolean)) {
          if (padded.includes(` ${label} `) && (!best || label.length > best.len)) best = { habit, len: label.length };
        }
      }

      const amount = detectAmount(n);
      const localDate = detectDate(n, ctx.today);

      if (best) {
        const h = best.habit;
        items.push({
          habitId: h.id,
          amount: h.kind === "quantity" ? (amount ?? h.defaultAmount) : 1,
          localDate,
        });
        continue;
      }

      const guess = n
        .split(" ")
        .filter((t) => t && !FILLER.has(t) && !/^\d/.test(t) && !(t in NUMBER_WORDS))
        .join(" ");
      if (guess) items.push({ habitGuess: guess, amount: amount ?? 1, localDate });
    }
    return items;
  },
};
