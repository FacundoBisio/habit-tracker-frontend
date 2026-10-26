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

export const parsedItemSchema = z.object({
  habit: z.string().min(1),
  amount: z.number().positive().default(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().optional().nullable(),
});
export const parsedResponseSchema = z.object({ items: z.array(parsedItemSchema) });

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
