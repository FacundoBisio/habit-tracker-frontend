import { formatInTimeZone } from "date-fns-tz";
import { toLocalDate, weekday } from "@/lib/domain/dates";
import { glyph } from "@/lib/habit-icons";
import type { ReminderTarget, Repo } from "@/lib/server/repo";
import { pendingToday } from "@/lib/server/service";
import type { TelegramClient } from "./api";
import { goalsText, weekText } from "./texts";

type Deps = { repo: Repo; tg: TelegramClient; now: () => Date };

/**
 * Se invoca cada minuto (pg_cron + pg_net, o GitHub Actions). Envía el recordatorio a quienes tienen
 * la hora configurada ahora mismo en su zona; los domingos agrega el resumen semanal.
 * Cada usuario se procesa aislado: un dato roto de uno no corta los avisos del resto.
 */
export async function runReminders(deps: Deps) {
  const now = deps.now();
  let sent = 0;
  for (const target of await deps.repo.listReminderTargets()) {
    try {
      sent += await remindOne(deps, target, now);
    } catch (err) {
      console.error("[reminders] falló un usuario:", err instanceof Error ? err.message : err);
    }
  }
  return sent;
}

async function remindOne(deps: Deps, target: ReminderTarget, now: Date) {
  if (formatInTimeZone(now, target.timezone, "HH:mm") !== target.reminderTime) return 0;

  const settings = await deps.repo.getSettings(target.userId);
  const today = toLocalDate(now, target.timezone);
  const [habits, entries] = await Promise.all([deps.repo.listHabits(target.userId), deps.repo.listEntries(target.userId)]);

  let sent = 0;
  const pending = pendingToday(habits, entries, today, settings);
  if (pending.length) {
    await deps.tg.sendMessage(target.chatId, `🔔 Te falta hoy:\n${pending.map((h) => `• ${glyph(h.emoji)} ${h.name}`).join("\n")}`);
    sent++;
  }
  if (weekday(today) === 0) {
    const goals = await deps.repo.listGoals(target.userId);
    await deps.tg.sendMessage(
      target.chatId,
      `📊 Resumen de la semana\n\n${weekText(habits, entries, today, settings)}\n\n${goalsText(goals, entries, today, settings)}`,
    );
    sent++;
  }
  return sent;
}
