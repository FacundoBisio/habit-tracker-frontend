import { z } from "zod";
import { toLocalDate } from "@/lib/domain/dates";
import type { Schedule } from "@/lib/domain/types";

/** Formato viejo: claves `habit-tracker:habits` y `habit-tracker:checks` de localStorage. */
const legacyHabit = z.object({
  id: z.string(),
  name: z.string().min(1),
  frequency: z.union([
    z.object({ type: z.literal("daily") }),
    z.object({ type: z.literal("weekly"), target: z.number().int().positive() }),
  ]),
  color: z.string().optional(),
  icon: z.string().optional(),
  archived: z.boolean().optional(),
  createdAt: z.string().optional(),
});

const legacyCheck = z.object({
  id: z.string(),
  habitId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const legacyPayload = z.object({
  habits: z.array(legacyHabit),
  checks: z.array(legacyCheck),
});

export interface ImportedHabit {
  legacyId: string;
  name: string;
  color: string;
  schedule: Schedule;
  archived: boolean;
}

export interface ImportedEntry {
  legacyHabitId: string;
  localDate: string;
  /** Instante de mediodía local, para que `occurred_at` no cambie de día por zona horaria. */
  occurredAt: Date;
  source: "import";
}

export function parseLegacy(raw: unknown, timeZone: string) {
  const { habits, checks } = legacyPayload.parse(raw);
  const known = new Set(habits.map((h) => h.id));

  const outHabits: ImportedHabit[] = habits.map((h) => ({
    legacyId: h.id,
    name: h.name,
    color: h.color ?? "emerald",
    schedule: h.frequency.type === "daily" ? { type: "daily" } : { type: "weekly", times: h.frequency.target },
    archived: h.archived ?? false,
  }));

  const seen = new Set<string>();
  const outEntries: ImportedEntry[] = [];
  for (const c of checks) {
    const key = `${c.habitId}|${c.date}`;
    if (!known.has(c.habitId) || seen.has(key)) continue; // huérfanos y duplicados
    seen.add(key);
    outEntries.push({
      legacyHabitId: c.habitId,
      localDate: c.date,
      occurredAt: localNoon(c.date, timeZone),
      source: "import",
    });
  }
  return { habits: outHabits, entries: outEntries };
}

function localNoon(date: string, timeZone: string): Date {
  // Probar offsets razonables hasta que el mediodía UTC±h caiga en esa fecha local a las 12.
  const base = Date.parse(`${date}T12:00:00Z`);
  for (const h of [0, 3, 4, 5, -3, -4, -5, 6, -6]) {
    const candidate = new Date(base + h * 3_600_000);
    if (toLocalDate(candidate, timeZone) === date) return candidate;
  }
  return new Date(base);
}
