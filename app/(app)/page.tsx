"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { HabitForm } from "@/components/HabitForm";
import { HabitRow } from "@/components/HabitRow";
import { LogSheet } from "@/components/LogSheet";
import { celebrate } from "@/components/celebrate";
import { fmt } from "@/lib/cn";
import { weekRange } from "@/lib/domain/dates";
import { isScheduledOn } from "@/lib/domain/schedule";
import { computeStreak } from "@/lib/domain/streaks";
import { logEntry, undoEntries } from "@/lib/store/actions";
import type { Habit } from "@/lib/store/db";
import { useEntries, useHabits, useSettings, useToday } from "@/lib/store/hooks";
import { primaryBtn } from "@/components/Sheet";

export default function TodayPage() {
  const habits = useHabits();
  const entries = useEntries();
  const settings = useSettings();
  const today = useToday();
  const [formOpen, setFormOpen] = useState(false);
  const [logging, setLogging] = useState<Habit | null>(null);

  const rows = useMemo(() => {
    const { start, end } = weekRange(today, settings.weekStartsOn);
    return habits
      .filter((h) => isScheduledOn(h.schedule, today))
      .map((habit) => {
        const mine = entries.filter((e) => e.habitId === habit.id);
        const todayEntries = mine.filter((e) => e.localDate === today);
        const weekDays = new Set(mine.filter((e) => e.localDate >= start && e.localDate <= end).map((e) => e.localDate));
        return {
          habit,
          todayIds: todayEntries.map((e) => e.id),
          state: {
            todayTotal: todayEntries.reduce((a, e) => a + e.amount, 0),
            streak: computeStreak(entries, habit.id, habit.schedule, today, settings.weekStartsOn).current,
            weekly: habit.schedule.type === "weekly" ? { done: weekDays.size, target: habit.schedule.times } : undefined,
          },
        };
      });
  }, [habits, entries, settings.weekStartsOn, today]);

  const doneCount = rows.filter((r) => r.state.todayTotal > 0).length;

  async function tap(row: (typeof rows)[number]) {
    const { habit } = row;
    if (habit.kind === "boolean" && row.state.todayTotal > 0) {
      await undoEntries(row.todayIds);
      toast(`${habit.emoji} ${habit.name} desmarcado`, {
        duration: 5000,
        action: { label: "Deshacer", onClick: () => logEntry({ habitId: habit.id, amount: 1 }) },
      });
      return;
    }
    const { entryId, completedGoals } = await logEntry({ habitId: habit.id, amount: habit.defaultAmount });
    toast.success(
      habit.kind === "quantity"
        ? `${habit.emoji} ${habit.name} +${fmt(habit.defaultAmount)} ${habit.unit ?? ""}`
        : `${habit.emoji} ${habit.name} hecho`,
      { duration: 5000, action: { label: "Deshacer", onClick: () => undoEntries([entryId]) } },
    );
    celebrate(completedGoals);
  }

  return (
    <>
      <PageHeader
        title="Hoy"
        subtitle={format(parseISO(today), "EEEE d 'de' MMMM", { locale: es })}
        action={
          <button
            onClick={() => setFormOpen(true)}
            aria-label="Nuevo hábito"
            className="grid size-11 place-items-center rounded-full bg-accent text-accent-fg transition active:scale-95"
          >
            <Plus className="size-5" />
          </button>
        }
      />

      {rows.length > 0 && (
        <div className="mb-4">
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>{doneCount} de {rows.length}</span>
            <span>{Math.round((doneCount / rows.length) * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={doneCount} aria-valuemax={rows.length}>
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${(doneCount / rows.length) * 100}%` }} />
          </div>
        </div>
      )}

      {habits.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-border p-8 text-center">
          <p className="text-4xl">🌱</p>
          <h2 className="mt-3 text-lg font-semibold">Empezá con tu primer hábito</h2>
          <p className="mt-1 mb-5 text-sm text-muted">Un toque por día alcanza. Después sumás objetivos.</p>
          <button className={primaryBtn} onClick={() => setFormOpen(true)}>Crear hábito</button>
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted">Hoy no hay hábitos programados. 🎈</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((row) => (
            <li key={row.habit.id}>
              <HabitRow habit={row.habit} state={row.state} onTap={() => tap(row)} onLongPress={() => setLogging(row.habit)} />
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && <p className="mt-4 text-center text-xs text-muted">Tocá para registrar · mantené para cantidad, nota o fecha</p>}

      <HabitForm open={formOpen} onClose={() => setFormOpen(false)} />
      <LogSheet habit={logging} today={today} onClose={() => setLogging(null)} />
    </>
  );
}
