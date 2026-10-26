"use client";

import { Plus, Target, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { GoalForm } from "@/components/GoalForm";
import { primaryBtn } from "@/components/Sheet";
import { cn, fmt } from "@/lib/cn";
import { computeGoalProgress } from "@/lib/domain/goals";
import { deleteGoal } from "@/lib/store/actions";
import type { Goal } from "@/lib/store/db";
import { useEntries, useGoals, useSettings, useToday } from "@/lib/store/hooks";

function paceText(delta: number, unit: string, completed: boolean, daysLeft: number) {
  if (completed) return "¡Completado!";
  if (daysLeft === 0) return "Último día";
  const d = Math.abs(delta);
  if (d < 0.05) return "Justo en ritmo";
  return delta > 0 ? `Vas ${fmt(d)} ${unit} adelantado` : `Vas ${fmt(d)} ${unit} atrasado`;
}

export default function GoalsPage() {
  const goals = useGoals();
  const entries = useEntries();
  const settings = useSettings();
  const today = useToday();
  const [open, setOpen] = useState(false);

  const items = useMemo(
    () =>
      goals
        .filter((g) => g.status === "active" || g.status === "completed")
        .map((goal) => ({ goal, p: computeGoalProgress(goal, goal.links, entries, today, settings.weekStartsOn) }))
        .sort((a, b) => Number(a.goal.status === "completed") - Number(b.goal.status === "completed")),
    [goals, entries, today, settings.weekStartsOn],
  );

  return (
    <>
      <PageHeader
        title="Objetivos"
        action={
          <button onClick={() => setOpen(true)} aria-label="Nuevo objetivo" className="grid size-11 place-items-center rounded-full bg-accent text-accent-fg transition active:scale-95">
            <Plus className="size-5" />
          </button>
        }
      />

      {items.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-border p-8 text-center">
          <span className="chip mx-auto grid size-16 place-items-center rounded-3xl"><Target className="size-8" strokeWidth={1.8} /></span>
          <h2 className="mt-3 text-lg font-semibold">Sin objetivos todavía</h2>
          <p className="mt-1 mb-5 text-sm text-muted">Cada registro suma solo a los objetivos vinculados.</p>
          <button className={primaryBtn} onClick={() => setOpen(true)}>Crear objetivo</button>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map(({ goal, p }) => (
            <GoalCard key={goal.id} goal={goal} p={p} />
          ))}
        </ul>
      )}
      <GoalForm open={open} onClose={() => setOpen(false)} today={today} />
    </>
  );
}

function GoalCard({ goal, p }: { goal: Goal; p: ReturnType<typeof computeGoalProgress> }) {
  const unit = goal.kind === "frequency" ? "semanas" : goal.kind === "streak" ? "días" : goal.unit ?? "";
  const done = goal.status === "completed";
  return (
    <li className={cn("card p-4", done && "border-accent/40")}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-display text-lg font-semibold tracking-tight">{goal.title}</h3>
        <button
          aria-label={`Borrar ${goal.title}`}
          onClick={() => confirm(`¿Borrar "${goal.title}"?`) && deleteGoal(goal.id)}
          className="-mt-1 -mr-2 grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-display text-3xl font-semibold tabular-nums">{fmt(p.current)}</span>
        <span className="text-sm text-muted">/ {fmt(p.target)} {unit}</span>
        <span className="ml-auto text-sm font-medium tabular-nums">{p.pct}%</span>
      </div>
      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${p.pct}%`, background: "var(--accent)" }} />
        {!done && p.target > 0 && (
          <div className="absolute inset-y-0 w-0.5 bg-fg/40" style={{ left: `${Math.min(100, (p.expected / p.target) * 100)}%` }} title="Ritmo esperado" />
        )}
      </div>
      <p className={cn("mt-2 text-xs", !done && p.delta < -0.05 ? "text-danger" : "text-muted")}>
        {paceText(p.delta, unit, done, p.daysLeft)}
        {!done && p.daysLeft > 0 && ` · ${p.daysLeft} ${p.daysLeft === 1 ? "día" : "días"} restantes`}
      </p>
    </li>
  );
}
