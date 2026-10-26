"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { Heatmap } from "@/components/Heatmap";
import { cn } from "@/lib/cn";
import { addDays } from "@/lib/domain/dates";
import { complianceRate } from "@/lib/domain/schedule";
import { computeStreak } from "@/lib/domain/streaks";
import { useEntries, useHabits, useSettings, useToday } from "@/lib/store/hooks";
import { HabitIcon } from "@/components/HabitIcon";

export default function StatsPage() {
  const habits = useHabits();
  const entries = useEntries();
  const settings = useSettings();
  const today = useToday();
  const [pick, setPick] = useState<string | null>(null);

  const habit = habits.find((h) => h.id === pick) ?? habits[0];

  const data = useMemo(() => {
    if (!habit) return null;
    const totals = new Map<string, number>();
    for (const e of entries) {
      if (e.habitId === habit.id) totals.set(e.localDate, (totals.get(e.localDate) ?? 0) + e.amount);
    }
    const active = new Set(totals.keys());
    return {
      totals,
      streak: computeStreak(entries, habit.id, habit.schedule, today, settings.weekStartsOn),
      c30: complianceRate(habit.schedule, active, today, 30, addDays),
      c90: complianceRate(habit.schedule, active, today, 90, addDays),
      total: [...totals.values()].reduce((a, b) => a + b, 0),
    };
  }, [habit, entries, today, settings.weekStartsOn]);

  if (habits.length === 0) {
    return (
      <>
        <PageHeader title="Stats" />
        <p className="mt-10 text-center text-sm text-muted">Registrá hábitos para ver tus estadísticas.</p>
      </>
    );
  }

  const unitLabel = habit?.kind === "quantity" ? habit.unit ?? "" : "veces";

  return (
    <>
      <PageHeader title="Stats" />
      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
        {habits.map((h) => (
          <button
            key={h.id}
            aria-pressed={habit?.id === h.id}
            onClick={() => setPick(h.id)}
            className={cn(
              "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition",
              habit?.id === h.id ? "border-accent bg-accent-soft/60" : "border-border text-muted",
            )}
          >
            <HabitIcon value={h.emoji} className="size-4" />
            {h.name}
          </button>
        ))}
      </div>

      {habit && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Racha actual" value={data.streak.current} suffix={habit.schedule.type === "weekly" ? "sem" : "días"} />
            <Stat label="Racha máxima" value={data.streak.longest} suffix={habit.schedule.type === "weekly" ? "sem" : "días"} />
            <Stat label="Cumplimiento 30 d" value={data.c30} suffix="%" />
            <Stat label="Cumplimiento 90 d" value={data.c90} suffix="%" />
          </div>
          <section className="card p-4">
            <h2 className="mb-3 text-sm font-medium text-muted">Último año · total {Math.round(data.total * 10) / 10} {unitLabel}</h2>
            <Heatmap totals={data.totals} today={today} weekStartsOn={settings.weekStartsOn} />
          </section>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="font-display mt-1 text-3xl font-semibold tabular-nums">
        {value} <span className="text-sm font-normal text-muted">{suffix}</span>
      </p>
    </div>
  );
}
