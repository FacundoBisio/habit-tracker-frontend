"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";
import { cn, fmt } from "@/lib/cn";
import { toast } from "@/lib/notify";
import { adjustDay, logEntry, setDayTotal, sumDay, undoEntries } from "@/lib/store/actions";
import type { Habit } from "@/lib/store/db";
import { useEntries } from "@/lib/store/hooks";
import { IconChip } from "./HabitIcon";
import { Sheet, ghostBtn, inputCls, labelCls, primaryBtn } from "./Sheet";
import { celebrate } from "./celebrate";

/** Editor detallado de un hábito: corregir el total de un día, nota y otra fecha. */
export function LogSheet({ habit, today, onClose }: { habit: Habit | null; today: string; onClose: () => void }) {
  return (
    <Sheet open={!!habit} onClose={onClose} title={habit?.name ?? ""} icon={habit ? <IconChip value={habit.emoji} size="sm" /> : undefined}>
      {habit && <Form key={habit.id} habit={habit} today={today} onClose={onClose} />}
    </Sheet>
  );
}

const round = (n: number) => Math.round(n * 100) / 100;

function Form({ habit, today, onClose }: { habit: Habit; today: string; onClose: () => void }) {
  const entries = useEntries();
  const [date, setDate] = useState(today);
  const [typed, setTyped] = useState<string | null>(null); // null = usar el total actual del día
  const [note, setNote] = useState("");
  const qty = habit.kind === "quantity";

  const current = sumDay(entries, habit.id, date);
  const value = typed ?? String(round(current));
  const parsed = Number(value.replace(",", "."));
  const target = Number.isFinite(parsed) ? Math.max(0, round(parsed)) : current;
  const dateOk = !!date && date <= today;
  const changed = Math.abs(target - current) > 1e-9;

  const bump = (delta: number) => setTyped(String(Math.max(0, round(target + delta))));
  const dayWord = date === today ? "hoy" : date;

  async function saveQty() {
    const before = current;
    const delta = target - before;
    let completedGoals: string[] = [];
    if (delta > 0) ({ completedGoals } = await logEntry({ habitId: habit.id, amount: delta, localDate: date, note: note.trim() || undefined }));
    else ({ completedGoals } = await adjustDay(habit.id, date, delta));
    toast.success(`${habit.name}: ${fmt(target)} ${habit.unit ?? ""} ${dayWord}`.replace("  ", " "), {
      icon: habit.emoji,
      action: { label: "Deshacer", onClick: () => setDayTotal(habit.id, date, before) },
    });
    celebrate(completedGoals);
    onClose();
  }

  async function addBoolean() {
    const { entryId, completedGoals } = await logEntry({ habitId: habit.id, amount: 1, localDate: date, note: note.trim() || undefined });
    toast.success(`${habit.name} registrado ${dayWord}`, {
      icon: habit.emoji,
      action: { label: "Deshacer", onClick: () => undoEntries([entryId]) },
    });
    celebrate(completedGoals);
    onClose();
  }

  async function removeBoolean() {
    const ids = entries.filter((e) => e.habitId === habit.id && e.localDate === date).map((e) => e.id);
    await undoEntries(ids);
    toast(`${habit.name} quitado ${dayWord}`, {
      icon: habit.emoji,
      action: { label: "Deshacer", onClick: () => void logEntry({ habitId: habit.id, amount: 1, localDate: date }) },
    });
    onClose();
  }

  return (
    <div className="space-y-5">
      <div>
        <label className={labelCls} htmlFor="l-date">Día</label>
        <input id="l-date" type="date" className={inputCls} value={date} max={today} onChange={(e) => { setDate(e.target.value); setTyped(null); }} />
      </div>

      {qty ? (
        <>
          <div>
            <label className={labelCls} htmlFor="l-total">
              Total {dayWord}{habit.unit ? ` (${habit.unit})` : ""}
            </label>
            <div className="flex items-center gap-2">
              <button aria-label="Restar uno" className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface-2 transition active:scale-90" onClick={() => bump(-1)}>
                <Minus className="size-5" />
              </button>
              <input
                id="l-total"
                inputMode="decimal"
                className={cn(inputCls, "font-display h-14 text-center text-2xl font-semibold tabular-nums")}
                value={value}
                onChange={(e) => setTyped(e.target.value)}
                autoFocus
              />
              <button aria-label="Sumar uno" className="grid size-12 shrink-0 place-items-center rounded-2xl bg-accent text-accent-fg transition active:scale-90" onClick={() => bump(1)}>
                <Plus className="size-5" />
              </button>
            </div>
            {habit.defaultAmount !== 1 && (
              <div className="mt-2 flex gap-2">
                <button className={cn(ghostBtn, "flex-1")} onClick={() => bump(-habit.defaultAmount)}>−{fmt(habit.defaultAmount)}</button>
                <button className={cn(ghostBtn, "flex-1")} onClick={() => bump(habit.defaultAmount)}>+{fmt(habit.defaultAmount)}</button>
                <button className={cn(ghostBtn, "flex-1 text-danger")} onClick={() => setTyped("0")}>Quitar todo</button>
              </div>
            )}
            <p className="mt-2 text-xs text-muted">
              Antes: {fmt(current)} {habit.unit}. Corregí el total para arreglar un registro de más o de menos.
            </p>
          </div>
          {target > current && (
            <div>
              <label className={labelCls} htmlFor="l-note">Nota (opcional)</label>
              <input id="l-note" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          )}
          <button className={primaryBtn} disabled={!dateOk || !changed} onClick={saveQty}>
            {changed ? "Guardar total" : "Sin cambios"}
          </button>
        </>
      ) : current > 0 ? (
        <>
          <p className="rounded-xl bg-accent-soft px-3.5 py-3 text-sm">Ya está registrado {dayWord}.</p>
          <button className={cn(ghostBtn, "w-full text-danger")} onClick={removeBoolean}>Quitar registro</button>
        </>
      ) : (
        <>
          <div>
            <label className={labelCls} htmlFor="l-note">Nota (opcional)</label>
            <input id="l-note" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button className={primaryBtn} disabled={!dateOk} onClick={addBoolean}>Registrar {dayWord}</button>
        </>
      )}
    </div>
  );
}
