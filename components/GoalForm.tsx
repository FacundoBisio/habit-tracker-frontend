"use client";

import { endOfMonth, endOfYear, format, parseISO, startOfMonth, startOfYear } from "date-fns";
import { useState } from "react";
import { toast } from "@/lib/notify";
import { cn } from "@/lib/cn";
import { addDays } from "@/lib/domain/dates";
import type { GoalKind, GoalLink } from "@/lib/domain/types";
import { addGoal } from "@/lib/store/actions";
import { useHabits } from "@/lib/store/hooks";
import { Sheet, inputCls, labelCls, primaryBtn } from "./Sheet";
import { HabitIcon } from "./HabitIcon";

const KINDS: [GoalKind, string, string][] = [
  ["count", "Cantidad de veces", "Leer 12 libros"],
  ["sum", "Suma total", "Correr 40 km"],
  ["frequency", "X veces por semana", "Gym 3×/sem durante 8 semanas"],
  ["streak", "Racha de días", "30 días seguidos"],
];

const iso = (d: Date) => format(d, "yyyy-MM-dd");

export function GoalForm({ open, onClose, today }: { open: boolean; onClose: () => void; today: string }) {
  return (
    <Sheet open={open} onClose={onClose} title="Nuevo objetivo">
      {open && <Form today={today} onClose={onClose} />}
    </Sheet>
  );
}

function Form({ today, onClose }: { today: string; onClose: () => void }) {
  const habits = useHabits();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<GoalKind>("count");
  const [target, setTarget] = useState("");
  const [unit, setUnit] = useState("");
  const [start, setStart] = useState(iso(startOfMonth(parseISO(today))));
  const [end, setEnd] = useState(iso(endOfMonth(parseISO(today))));
  const [selected, setSelected] = useState<Record<string, number>>({});

  const t = Number(target.replace(",", "."));
  const valid = title.trim() && t > 0 && end >= start && Object.keys(selected).length > 0;

  function toggleHabit(id: string) {
    setSelected((s) => {
      const { [id]: had, ...rest } = s;
      return had === undefined ? { ...s, [id]: 1 } : rest;
    });
  }

  async function save() {
    const links: GoalLink[] = Object.entries(selected).map(([habitId, weight]) => ({ habitId, weight }));
    await addGoal({ title: title.trim(), kind, targetValue: t, unit: unit.trim() || undefined, periodStart: start, periodEnd: end, links });
    toast.success("Objetivo creado");
    onClose();
  }

  const presets = [
    ["Este mes", iso(startOfMonth(parseISO(today))), iso(endOfMonth(parseISO(today)))],
    ["Este año", iso(startOfYear(parseISO(today))), iso(endOfYear(parseISO(today)))],
    ["8 semanas", today, addDays(today, 8 * 7 - 1)],
  ] as const;

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls} htmlFor="g-title">Título</label>
        <input id="g-title" className={inputCls} value={title} placeholder="Leer 12 libros en 2026" onChange={(e) => setTitle(e.target.value)} />
      </div>

      <div>
        <span className={labelCls}>Tipo</span>
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map(([k, label, hint]) => (
            <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}
              className={cn("rounded-xl border p-2.5 text-left transition", kind === k ? "border-accent bg-accent-soft/50" : "border-border")}>
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-xs text-muted">{hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className={labelCls} htmlFor="g-target">
            {kind === "frequency" ? "Veces por semana" : kind === "streak" ? "Días seguidos" : "Meta"}
          </label>
          <input id="g-target" className={inputCls} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
        </div>
        {(kind === "sum" || kind === "count") && (
          <div className="flex-1">
            <label className={labelCls} htmlFor="g-unit">Unidad</label>
            <input id="g-unit" className={inputCls} value={unit} placeholder="km, libros" onChange={(e) => setUnit(e.target.value)} />
          </div>
        )}
      </div>

      <div>
        <span className={labelCls}>Período</span>
        <div className="mb-2 flex flex-wrap gap-2">
          {presets.map(([label, s, e]) => (
            <button key={label} onClick={() => { setStart(s); setEnd(e); }}
              className="min-h-9 rounded-full border border-border px-3 text-xs font-medium hover:bg-surface-2">{label}</button>
          ))}
        </div>
        <div className="flex gap-3">
          <input aria-label="Desde" type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
          <input aria-label="Hasta" type="date" className={inputCls} value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>

      <div>
        <span className={labelCls}>Hábitos que suman</span>
        {habits.length === 0 && <p className="text-sm text-muted">Primero creá un hábito.</p>}
        <div className="space-y-2">
          {habits.map((h) => {
            const on = selected[h.id] !== undefined;
            return (
              <div key={h.id} className={cn("flex min-h-12 items-center gap-2 rounded-xl border px-3", on ? "border-accent" : "border-border")}>
                <button className="flex flex-1 items-center gap-2 py-2 text-left" aria-pressed={on} onClick={() => toggleHabit(h.id)}>
                  <HabitIcon value={h.emoji} className="size-4" /><span className="text-sm">{h.name}</span>
                </button>
                {on && (
                  <label className="flex items-center gap-1.5 text-xs text-muted">
                    peso
                    <input aria-label={`Peso de ${h.name}`} className="h-9 w-16 rounded-lg border border-border bg-bg px-2 text-center" inputMode="decimal"
                      value={selected[h.id]} onChange={(e) => setSelected((s) => ({ ...s, [h.id]: Number(e.target.value.replace(",", ".")) || 0 }))} />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <button className={primaryBtn} disabled={!valid} onClick={save}>Crear objetivo</button>
    </div>
  );
}
