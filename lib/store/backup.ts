/**
 * Backup e importación. Vive aparte de `actions.ts` porque arrastra zod (validación del backup y del
 * formato viejo): Ajustes lo carga con `import()` recién al tocar Importar/Exportar, así zod no viaja
 * en el JS inicial.
 */
import { parseLegacy } from "@/lib/import/legacy";
import { z } from "zod";
import { getSettings } from "./actions";
import { db, type Entry, type Goal, type Habit, type Settings } from "./db";

const uid = () => crypto.randomUUID();

const backupSchema = z.object({
  version: z.literal(1),
  habits: z.array(z.custom<Habit>()),
  entries: z.array(z.custom<Entry>()),
  goals: z.array(z.custom<Goal>()),
  settings: z.custom<Settings>().optional(),
});

export async function exportAll() {
  return {
    version: 1 as const,
    exportedAt: new Date().toISOString(),
    habits: await db.habits.toArray(),
    entries: await db.entries.toArray(),
    goals: await db.goals.toArray(),
    settings: await getSettings(),
  };
}

/** Acepta un backup propio o el formato viejo (`habit-tracker:habits` / `:checks`). */
export async function importJson(raw: unknown): Promise<{ habits: number; entries: number }> {
  const own = backupSchema.safeParse(raw);
  if (own.success) {
    const d = own.data;
    await db.transaction("rw", db.habits, db.entries, db.goals, db.settings, async () => {
      await db.habits.bulkPut(d.habits);
      await db.entries.bulkPut(d.entries);
      await db.goals.bulkPut(d.goals);
      if (d.settings) await db.settings.put(d.settings);
    });
    return { habits: d.habits.length, entries: d.entries.length };
  }

  const settings = await getSettings();
  const legacy = parseLegacy(raw, settings.timezone);
  const idMap = new Map<string, string>();
  let order = await db.habits.count();
  const habits: Habit[] = legacy.habits.map((h) => {
    const id = uid();
    idMap.set(h.legacyId, id);
    return {
      id,
      name: h.name,
      emoji: "sparkles",
      color: h.color,
      kind: "boolean",
      defaultAmount: 1,
      schedule: h.schedule,
      archived: h.archived,
      sortOrder: order++,
      aliases: [],
    };
  });
  const entries: Entry[] = legacy.entries.map((e) => ({
    id: uid(),
    clientId: uid(),
    habitId: idMap.get(e.legacyHabitId)!,
    localDate: e.localDate,
    occurredAt: e.occurredAt.getTime(),
    amount: 1,
    source: "import",
  }));
  await db.transaction("rw", db.habits, db.entries, async () => {
    await db.habits.bulkAdd(habits);
    await db.entries.bulkAdd(entries);
  });
  return { habits: habits.length, entries: entries.length };
}
