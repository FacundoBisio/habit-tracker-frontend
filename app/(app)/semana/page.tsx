"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { HABIT_COLORS } from "@/components/HabitForm";
import { cn, haptic } from "@/lib/cn";
import { addDays, weekRange } from "@/lib/domain/dates";
import { isScheduledOn } from "@/lib/domain/schedule";
import { logEntry, undoEntries } from "@/lib/store/actions";
import { useEntries, useHabits, useSettings, useToday } from "@/lib/store/hooks";

export default function WeekPage() {
  const habits = useHabits();
  const entries = useEntries();
  const settings = useSettings();
  const today = useToday();
  const [offset, setOffset] = useState(0);

  const { start } = weekRange(addDays(today, offset * 7), settings.weekStartsOn);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  async function toggle(habitId: string, date: string, amount: number) {
    if (date > today) return;
    haptic(8);
    const existing = entries.filter((e) => e.habitId === habitId && e.localDate === date);
    if (existing.length) await undoEntries(existing.map((e) => e.id));
    else await logEntry({ habitId, amount, localDate: date });
  }

  return (
    <>
      <PageHeader
        title="Semana"
        subtitle={`${format(parseISO(days[0]), "d MMM", { locale: es })} – ${format(parseISO(days[6]), "d MMM", { locale: es })}`}
        action={
          <div className="flex gap-1">
            <button aria-label="Semana anterior" onClick={() => setOffset((o) => o - 1)} className="grid size-11 place-items-center rounded-full hover:bg-surface-2"><ChevronLeft className="size-5" /></button>
            <button aria-label="Semana siguiente" disabled={offset >= 0} onClick={() => setOffset((o) => o + 1)} className="grid size-11 place-items-center rounded-full hover:bg-surface-2 disabled:opacity-30"><ChevronRight className="size-5" /></button>
          </div>
        }
      />

      {habits.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted">Creá un hábito desde “Hoy” para verlo acá.</p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="grid grid-cols-[1fr_repeat(7,2.5rem)] items-center gap-x-0.5 border-b border-border px-3 py-2 text-center text-[11px] text-muted">
            <span />
            {days.map((d) => (
              <span key={d} className={cn(d === today && "font-semibold text-accent")}>
                {format(parseISO(d), "EEEEE", { locale: es }).toUpperCase()}
                <br />
                {format(parseISO(d), "d")}
              </span>
            ))}
          </div>
          {habits.map((h) => {
            const hex = HABIT_COLORS[h.color] ?? HABIT_COLORS.teal;
            return (
              <div key={h.id} className="grid grid-cols-[1fr_repeat(7,2.5rem)] items-center gap-x-0.5 border-b border-border px-3 last:border-0">
                <span className="truncate py-3 pr-2 text-sm">{h.emoji} {h.name}</span>
                {days.map((d) => {
                  const done = entries.some((e) => e.habitId === h.id && e.localDate === d);
                  const off = d > today || !isScheduledOn(h.schedule, d);
                  return (
                    <button
                      key={d}
                      disabled={d > today}
                      aria-label={`${h.name} ${d}${done ? ", hecho" : ""}`}
                      aria-pressed={done}
                      onClick={() => toggle(h.id, d, h.defaultAmount)}
                      className="grid size-10 place-items-center disabled:cursor-default"
                    >
                      <span
                        className={cn("size-6 rounded-full border transition", done ? "border-transparent" : "border-border", off && !done && "opacity-30")}
                        style={done ? { background: hex } : undefined}
                      />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
