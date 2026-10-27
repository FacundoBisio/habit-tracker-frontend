import { z } from "zod";
import { resolveHabit } from "@/lib/domain/match";
import type { ServerHabit } from "@/lib/server/repo";

export interface ParsedItem {
  /** Id de un hábito existente (si el parser lo resolvió). */
  habitId?: string;
  /** Texto libre cuando no hay match claro. */
  habitGuess?: string;
  amount: number;
  localDate: string;
  note?: string;
}

export interface ParseContext {
  habits: Pick<ServerHabit, "id" | "name" | "aliases" | "kind" | "unit" | "defaultAmount">[];
  today: string;
  timezone: string;
}

export interface NLParser {
  name: string;
  parse(text: string, ctx: ParseContext): Promise<ParsedItem[]>;
}

/** El tope de cantidad (MAX_AMOUNT) se aplica al normalizar: un ítem fuera de rango se descarta sin tirar el resto. */
export const parsedItemSchema = z.object({
  habit: z.string().min(1),
  amount: z.number().positive().default(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().optional().nullable(),
});
export const parsedResponseSchema = z.object({ items: z.array(parsedItemSchema) });

/** Por encima de esta cantidad de ítems nunca se registra sin una confirmación explícita. */
export const CONFIRM_ABOVE_ITEMS = 5;

/**
 * Un lote grande es la señal típica de un prompt manipulado (o de un modelo que alucina):
 * con más de CONFIRM_ABOVE_ITEMS ítems el que llama SIEMPRE pide confirmación.
 */
export const needsConfirmation = (items: readonly unknown[]) => items.length > CONFIRM_ABOVE_ITEMS;

export interface ResolvedItem {
  habit: ServerHabit;
  amount: number;
  localDate: string;
  note?: string;
}
export interface UnmatchedItem {
  term: string;
  amount: number;
  localDate: string;
}

/** Separa ítems con hábito conocido de los que no matchean (para crear hábito o guardar alias). */
export function resolveItems(items: ParsedItem[], habits: ServerHabit[]) {
  const resolved: ResolvedItem[] = [];
  const unmatched: UnmatchedItem[] = [];
  for (const it of items) {
    const query = it.habitId ?? it.habitGuess ?? "";
    const m = resolveHabit(habits, query);
    if (m.type === "match") {
      resolved.push({ habit: m.habit, amount: it.amount, localDate: it.localDate, note: it.note });
    } else {
      unmatched.push({ term: it.habitGuess ?? query, amount: it.amount, localDate: it.localDate });
    }
  }
  return { resolved, unmatched };
}
