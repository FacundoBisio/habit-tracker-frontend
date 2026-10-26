import { addDays, weekRange } from "@/lib/domain/dates";
import { computeGoalProgress } from "@/lib/domain/goals";
import { isScheduledOn } from "@/lib/domain/schedule";
import type { ServerEntry, ServerGoal, ServerHabit, ServerSettings } from "@/lib/server/repo";
import { fmtNum } from "@/lib/server/service";

export const bar = (pct: number, width = 10) => {
  const filled = Math.round((Math.min(100, pct) / 100) * width);
  return "▓".repeat(filled) + "░".repeat(width - filled);
};

export function todayText(habits: ServerHabit[], entries: ServerEntry[], today: string, settings: ServerSettings) {
  const { start, end } = weekRange(today, settings.weekStartsOn);
  const lines = habits
    .filter((h) => !h.archived && isScheduledOn(h.schedule, today))
    .map((h) => {
      const mine = entries.filter((e) => e.habitId === h.id);
      const total = mine.filter((e) => e.localDate === today).reduce((a, e) => a + e.amount, 0);
      const done = total > 0;
      let extra = "";
      if (h.kind === "quantity") extra = ` · ${fmtNum(total)}${h.unit ? ` ${h.unit}` : ""}`;
      if (h.schedule.type === "weekly") {
        const days = new Set(mine.filter((e) => e.localDate >= start && e.localDate <= end).map((e) => e.localDate));
        extra += ` · semana ${days.size}/${h.schedule.times}`;
      }
      return `${done ? "✅" : "⬜"} ${h.emoji} ${h.name}${extra}`;
    });
  return lines.length ? `📅 Hoy\n${lines.join("\n")}` : "Hoy no tenés hábitos programados. 🎈";
}

const LETTERS = ["D", "L", "M", "M", "J", "V", "S"];

export function weekText(habits: ServerHabit[], entries: ServerEntry[], today: string, settings: ServerSettings) {
  const { start } = weekRange(today, settings.weekStartsOn);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const head = days.map((d) => LETTERS[new Date(`${d}T00:00:00Z`).getUTCDay()]).join(" ");
  const rows = habits
    .filter((h) => !h.archived)
    .map((h) => {
      const set = new Set(entries.filter((e) => e.habitId === h.id).map((e) => e.localDate));
      const cells = days.map((d) => (set.has(d) ? "●" : d > today ? "·" : "○")).join(" ");
      const count = days.filter((d) => set.has(d)).length;
      const target = h.schedule.type === "weekly" ? `/${h.schedule.times}` : "";
      return `${cells}  ${h.emoji} ${h.name} ${count}${target}`;
    });
  return rows.length ? `🗓 Semana\n${head}\n${rows.join("\n")}` : "Todavía no tenés hábitos.";
}

export function goalsText(goals: ServerGoal[], entries: ServerEntry[], today: string, settings: ServerSettings) {
  const lines = goals
    .filter((g) => g.status === "active" || g.status === "completed")
    .map((g) => {
      const p = computeGoalProgress(g, g.links, entries, today, settings.weekStartsOn);
      const unit = g.kind === "frequency" ? "sem" : g.kind === "streak" ? "días" : (g.unit ?? "");
      let pace = "";
      if (p.completed) pace = " 🎉";
      else if (p.delta < -0.05) pace = ` · ${fmtNum(-p.delta)} ${unit} atrasado`;
      else if (p.delta > 0.05) pace = ` · ${fmtNum(p.delta)} ${unit} adelantado`;
      return `🎯 ${g.title}\n${bar(p.pct)} ${p.pct}% (${fmtNum(p.current)}/${fmtNum(p.target)} ${unit})${pace}${p.completed ? "" : ` · ${p.daysLeft} d`}`;
    });
  return lines.length ? lines.join("\n\n") : "No tenés objetivos activos. Creá uno en la app.";
}

export const HELP = [
  "Escribime en lenguaje natural y lo registro:",
  "• agua 3",
  "• ayer gym",
  "• esta semana fui 3 veces al gym y leí 2 capítulos",
  "",
  "Comandos: /hoy /semana /objetivos /deshacer /recordatorios /teclado",
].join("\n");

export const UNLINKED =
  "Primero vinculá tu cuenta: en la app → Ajustes → Telegram generá un código y mandame /vincular CÓDIGO";
