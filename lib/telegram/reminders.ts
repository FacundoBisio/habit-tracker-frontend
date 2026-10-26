import { formatInTimeZone } from "date-fns-tz";
import { toLocalDate, weekday } from "@/lib/domain/dates";
import type { Repo } from "@/lib/server/repo";
import { pendingToday } from "@/lib/server/service";
import type { TelegramClient } from "./api";
import { goalsText, weekText } from "./texts";

/**
 * Se invoca cada minuto (pg_cron + pg_net, o GitHub Actions). Envía el recordatorio a quienes tienen
 * la hora configurada ahora mismo en su zona; los domingos agrega el resumen semanal.
 */
export async function runReminders(deps: { repo: Repo; tg: TelegramClient; now: () => Date }) {
  const now = deps.now();
  let sent = 0;
  for (const target of await deps.repo.listReminderTargets()) {
    if (formatInTimeZone(now, target.timezone, "HH:mm") !== target.reminderTime) continue;
    const settings = await deps.repo.getSettings(target.userId);
    const today = toLocalDate(now, target.timezone);
    const [habits, entries] = await Promise.all([deps.repo.listHabits(target.userId), deps.repo.listEntries(target.userId)]);

    const pending = pendingToday(habits, entries, today, settings);
    if (pending.length) {
      await deps.tg.sendMessage(
        target.chatId,
        `🔔 Te falta hoy:\n${pending.map((h) => `• ${h.emoji} ${h.name}`).join("\n")}`,
      );
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
  }
  return sent;
}
