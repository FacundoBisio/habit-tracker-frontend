"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { m } from "framer-motion";
import { Plus, Sprout, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { HabitForm } from "@/components/HabitForm";
import { HabitRow } from "@/components/HabitRow";
import { LogSheet } from "@/components/LogSheet";
import { Mascot } from "@/components/Mascot";
import { Ring } from "@/components/Ring";
import { WeekStrip } from "@/components/WeekStrip";
import { celebrate } from "@/components/celebrate";
import { primaryBtn } from "@/components/Sheet";
import { fmt, unitLabel } from "@/lib/cn";
import { fireParty } from "@/lib/confetti";
import { addDays } from "@/lib/domain/dates";
import { activityFor, playActivity } from "@/lib/mascot";
import { toast } from "@/lib/notify";
import { adjustDay, logEntry, undoEntries } from "@/lib/store/actions";
import type { Habit } from "@/lib/store/db";
import { useSettings } from "@/lib/store/hooks";
import { useDaySummary, type DayRow } from "@/lib/store/day";

const list = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 320, damping: 28 } } };

/** "Hoy lunes 26 de octubre" / "Ayer domingo 25 de octubre" / "Martes 20 de octubre". */
function dayLabel(day: string, today: string) {
  const base = format(parseISO(day), "EEEE d 'de' MMMM", { locale: es });
  if (day === today) return `Hoy ${base}`;
  if (day === addDays(today, -1)) return `Ayer ${base}`;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export default function TodayPage() {
  const [picked, setPicked] = useState<string | null>(null);
  const summary = useDaySummary(picked ?? undefined);
  const { today, day, strip, hasHabits, ready } = summary;
  // Respuesta inmediata: la fila se marca al tocar, antes de que IndexedDB guarde y se relea el historial.
  // Vale solo mientras la base no cambió (`base`): cuando llegan los datos reales se descarta sola.
  const [optimisticState, setOptimisticState] = useState<{ base: DayRow[]; map: Record<string, number> }>({ base: [], map: {} });
  const optimistic = optimisticState.base === summary.rows ? optimisticState.map : {};
  const setOptimistic = (update: (map: Record<string, number>) => Record<string, number>) =>
    setOptimisticState((o) => ({ base: summary.rows, map: update(o.base === summary.rows ? o.map : {}) }));
  const pending = useRef(new Set<string>());
  const rows = Object.keys(optimistic).length
    ? summary.rows.map((r) => (r.habit.id in optimistic ? { ...r, todayTotal: optimistic[r.habit.id] } : r))
    : summary.rows;
  const total = rows.length;
  const done = rows.filter((r) => r.todayTotal > 0).length;
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);
  const isToday = day === today;
  const { name } = useSettings();

  // Confeti grande cuando se completa el día (solo al pasar de incompleto a completo).
  const wasComplete = useRef(total > 0 && done === total);
  useEffect(() => {
    const complete = total > 0 && done === total;
    if (complete && !wasComplete.current) {
      fireParty();
      playActivity("celebrate");
    }
    wasComplete.current = complete;
  }, [done, total, day]);

  async function toggle(row: DayRow) {
    const { habit } = row;
    if (pending.current.has(habit.id)) return; // el toque anterior todavía se está guardando
    pending.current.add(habit.id);
    const undo = row.todayTotal > 0;
    setOptimistic((o) => ({ ...o, [habit.id]: undo ? 0 : habit.defaultAmount }));
    playActivity(activityFor(habit.emoji)); // 10 s haciendo lo último que tocaste
    try {
      if (undo) {
        await undoEntries(row.todayIds);
        toast(`${habit.name} desmarcado`, {
          icon: habit.emoji,
          action: { label: "Deshacer", onClick: () => void logEntry({ habitId: habit.id, amount: 1, localDate: day }) },
        });
        return;
      }
      const { entryId, completedGoals } = await logEntry({ habitId: habit.id, amount: habit.defaultAmount, localDate: day });
      toast.success(`${habit.name} hecho`, { icon: habit.emoji, action: { label: "Deshacer", onClick: () => void undoEntries([entryId]) } });
      celebrate(completedGoals);
    } catch {
      // No se guardó: la fila vuelve a mostrar lo que hay en la base.
      setOptimistic((o) => Object.fromEntries(Object.entries(o).filter(([id]) => id !== habit.id)));
      toast.error("No se pudo guardar. Probá de nuevo.");
    } finally {
      pending.current.delete(habit.id);
    }
  }

  async function adjust(row: DayRow, delta: number) {
    const { habit } = row;
    playActivity(activityFor(habit.emoji));
    const unit = habit.unit ? ` ${unitLabel(Math.abs(delta), habit.unit)}` : "";
    const { completedGoals } = await adjustDay(habit.id, day, delta);
    toast.success(`${habit.name} ${delta > 0 ? "+" : "−"}${fmt(Math.abs(delta))}${unit}`, {
      icon: habit.emoji,
      action: { label: "Deshacer", onClick: () => void adjustDay(habit.id, day, -delta) },
    });
    celebrate(completedGoals);
  }

  const next = rows.find((r) => r.todayTotal === 0);
  const message = !hasHabits
    ? "¡Hola! Creá tu primer hábito y arrancamos."
    : total === 0
      ? "No hay hábitos programados para este día."
      : !isToday
        ? done === total
          ? "Ese día quedó completo."
          : `Ese día hiciste ${done} de ${total}. Podés corregirlo acá.`
        : done === total
          ? "¡Día completo! Muy buen trabajo."
          : done === 0
            ? `Empezá por ${next?.habit.name ?? "el primero"}: un toque y listo.`
            : `Vas ${done} de ${total}. Te falta ${next?.habit.name}.`;

  return (
    <>
      <header className="mb-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display truncate text-[38px] leading-[1.02] font-semibold tracking-tight">Hola, {name ?? ""}</h1>
          <p className="mt-2 flex items-center gap-2 text-[15px] text-muted">
            <span>{dayLabel(day, today)}</span>
            {!isToday && (
              <button
                onClick={() => setPicked(null)}
                className="inline-flex min-h-8 items-center gap-1 rounded-full bg-accent-soft px-2.5 text-xs font-semibold text-accent"
              >
                <Undo2 className="size-3" /> Volver a hoy
              </button>
            )}
          </p>
        </div>
        {total > 0 && (
          <div data-tour="anillo">
            <Ring done={done} total={total} />
          </div>
        )}
      </header>

      {ready && hasHabits && (
        <div data-tour="semana">
          <WeekStrip days={strip} selected={day} onSelect={(d) => setPicked(d === today ? null : d)} />
        </div>
      )}

      {ready && <Mascot message={message} />}

      {!ready ? (
        <div className="space-y-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="card h-[74px] animate-pulse rounded-[1.4rem]" />
          ))}
        </div>
      ) : !hasHabits ? (
        <div className="card card-lg p-8 text-center">
          <span className="chip mx-auto grid size-16 place-items-center rounded-3xl"><Sprout className="size-8" strokeWidth={1.8} /></span>
          <h2 className="font-display mt-4 text-xl font-semibold tracking-tight">Empezá con tu primer hábito</h2>
          <p className="mt-1.5 mb-6 text-sm text-muted">Un toque por día alcanza. Después sumás objetivos.</p>
          <button className={primaryBtn} onClick={() => setFormOpen(true)} data-tour="crear-habito">Crear hábito</button>
        </div>
      ) : (
        <>
          <m.ul key={day} variants={list} initial="hidden" animate="show" className="space-y-3">
            {rows.map((row, i) => (
              <m.li key={`${day}:${row.habit.id}`} variants={item} data-tour={i === 0 ? "fila-habito" : undefined}>
                <HabitRow row={row} onToggle={() => toggle(row)} onAdjust={(d) => adjust(row, d)} onOpen={() => {
                    playActivity(activityFor(row.habit.emoji));
                    setEditing(row.habit);
                  }}
                />
              </m.li>
            ))}
          </m.ul>
          <button
            onClick={() => setFormOpen(true)}
            aria-label="Nuevo hábito"
            className="mt-3 flex min-h-14 w-full items-center justify-center gap-2 rounded-[1.4rem] border border-dashed border-border text-sm font-medium text-muted transition hover:border-accent hover:text-accent active:scale-[0.99]"
          >
            <Plus className="size-4" /> Agregar hábito
          </button>
          {rows.length > 0 && <p className="mt-5 text-center text-xs text-muted">Tocá para registrar. Mantené presionado para corregir.</p>}
        </>
      )}

      <HabitForm open={formOpen} onClose={() => setFormOpen(false)} />
      <LogSheet habit={editing} today={day} onClose={() => setEditing(null)} />
    </>
  );
}
