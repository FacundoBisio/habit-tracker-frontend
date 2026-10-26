"use client";

import { useState } from "react";
import { toast } from "@/lib/notify";
import type { Schedule } from "@/lib/domain/types";
import { cn } from "@/lib/cn";
import { DEFAULT_ICON, HABIT_ICONS, iconKey } from "@/lib/habit-icons";
import { addHabit, deleteHabit, updateHabit } from "@/lib/store/actions";
import type { Habit } from "@/lib/store/db";
import { HabitIcon } from "./HabitIcon";
import { Sheet, ghostBtn, inputCls, labelCls, primaryBtn } from "./Sheet";

const DAYS = ["D", "L", "M", "M", "J", "V", "S"];

export function HabitForm({ open, onClose, habit }: { open: boolean; onClose: () => void; habit?: Habit }) {
  // key fuerza estado nuevo al abrir con otro hábito
  return (
    <Sheet open={open} onClose={onClose} title={habit ? "Editar hábito" : "Nuevo hábito"}>
      {open && <Form key={habit?.id ?? "new"} habit={habit} onClose={onClose} />}
    </Sheet>
  );
}

function Form({ habit, onClose }: { habit?: Habit; onClose: () => void }) {
  const [name, setName] = useState(habit?.name ?? "");
  const [icon, setIcon] = useState<string>(habit ? iconKey(habit.emoji) : DEFAULT_ICON);
  const [kind, setKind] = useState<Habit["kind"]>(habit?.kind ?? "boolean");
  const [unit, setUnit] = useState(habit?.unit ?? "");
  const [amount, setAmount] = useState(String(habit?.defaultAmount ?? 1));
  const [freq, setFreq] = useState<Schedule["type"]>(habit?.schedule.type ?? "daily");
  const [times, setTimes] = useState(habit?.schedule.type === "weekly" ? habit.schedule.times : 3);
  const [days, setDays] = useState<number[]>(habit?.schedule.type === "days_of_week" ? habit.schedule.days : [1, 3, 5]);
  const [aliases, setAliases] = useState((habit?.aliases ?? []).join(", "));

  const schedule: Schedule =
    freq === "daily" ? { type: "daily" } : freq === "weekly" ? { type: "weekly", times } : { type: "days_of_week", days };
  const valid = name.trim().length > 0 && (freq !== "days_of_week" || days.length > 0);

  async function save() {
    const base = {
      name: name.trim(),
      emoji: icon,
      color: habit?.color ?? "green",
      kind,
      unit: kind === "quantity" ? unit.trim() || undefined : undefined,
      defaultAmount: kind === "quantity" ? Math.max(Number(amount.replace(",", ".")) || 1, 0.01) : 1,
      schedule,
      aliases: aliases.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean),
    };
    if (habit) await updateHabit(habit.id, base);
    else await addHabit(base);
    toast.success(habit ? "Hábito actualizado" : "Hábito creado");
    onClose();
  }

  async function remove() {
    if (!habit || !confirm(`¿Borrar "${habit.name}" y todos sus registros?`)) return;
    await deleteHabit(habit.id);
    toast("Hábito borrado");
    onClose();
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls} htmlFor="h-name">Nombre</label>
        <input id="h-name" className={inputCls} value={name} placeholder="Ej: Agua, Gym, Leer" onChange={(e) => setName(e.target.value)} autoFocus={!habit} />
      </div>

      <div>
        <span className={labelCls}>Ícono</span>
        <div role="radiogroup" aria-label="Ícono" className="grid grid-cols-6 gap-2">
          {HABIT_ICONS.map((i) => (
            <button
              key={i.key}
              role="radio"
              aria-checked={icon === i.key}
              aria-label={i.label}
              title={i.label}
              onClick={() => setIcon(i.key)}
              data-on={icon === i.key}
              className="icon-option grid aspect-square min-h-11 place-items-center rounded-2xl active:scale-90"
            >
              <HabitIcon value={i.key} className="size-5" />
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className={labelCls}>Tipo</span>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[["boolean", "Lo hice / no"], ["quantity", "Cantidad"]]}
        />
      </div>

      {kind === "quantity" && (
        <div className="flex gap-3">
          <div className="flex-1">
            <label className={labelCls} htmlFor="h-unit">Unidad</label>
            <input id="h-unit" className={inputCls} value={unit} placeholder="vasos, km, min" onChange={(e) => setUnit(e.target.value)} />
          </div>
          <div className="w-28">
            <label className={labelCls} htmlFor="h-amount">Por toque</label>
            <input id="h-amount" className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
      )}

      <div>
        <span className={labelCls}>Frecuencia</span>
        <Segmented
          value={freq}
          onChange={setFreq}
          options={[["daily", "Diario"], ["weekly", "X por semana"], ["days_of_week", "Días"]]}
        />
        {freq === "weekly" && (
          <div className="mt-3 flex items-center gap-3">
            <button className={cn(ghostBtn, "w-11 px-0")} onClick={() => setTimes((t) => Math.max(1, t - 1))} aria-label="Menos">−</button>
            <span className="min-w-24 text-center font-medium">{times} por semana</span>
            <button className={cn(ghostBtn, "w-11 px-0")} onClick={() => setTimes((t) => Math.min(7, t + 1))} aria-label="Más">+</button>
          </div>
        )}
        {freq === "days_of_week" && (
          <div className="mt-3 flex justify-between">
            {DAYS.map((d, i) => (
              <button
                key={i}
                aria-pressed={days.includes(i)}
                aria-label={["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][i]}
                onClick={() => setDays((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]))}
                className={cn(
                  "size-11 rounded-full border text-sm font-medium transition",
                  days.includes(i) ? "border-accent bg-accent text-accent-fg" : "border-border text-muted",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className={labelCls} htmlFor="h-alias">Alias (separados por coma)</label>
        <input id="h-alias" className={inputCls} value={aliases} placeholder="entrené, pesas" onChange={(e) => setAliases(e.target.value)} />
        <p className="mt-1 text-xs text-muted">El bot y los Atajos los usan para reconocer el hábito.</p>
      </div>

      <button className={primaryBtn} disabled={!valid} onClick={save}>Guardar</button>
      {habit && (
        <button className={cn(ghostBtn, "w-full text-danger")} onClick={remove}>Borrar hábito</button>
      )}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div role="radiogroup" className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-surface-2 p-1">
      {options.map(([v, label]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "min-h-10 rounded-lg px-2 text-sm font-medium transition",
            value === v ? "bg-surface shadow-sm" : "text-muted",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
