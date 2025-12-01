import type { Habit, HabitCheck, HabitFrequency } from "../../types/habit";
import { HabitCard } from "./HabitCard";
import { useState } from "react";

interface Props {
  habits: Habit[];
  checks: HabitCheck[];
  date: string;
  onToggle: (habitId: string, date: string) => void;
  onAddHabit: (name: string, frequency: HabitFrequency) => void;
}

export function HabitList({
  habits,
  checks,
  date,
  onToggle,
  onAddHabit,
}: Props) {
  const [newHabit, setNewHabit] = useState("");
  const [frequency, setFrequency] = useState<HabitFrequency>("daily");

  const handleAdd = () => {
    const name = newHabit.trim();
    if (!name) return;
    onAddHabit(name, frequency);
    setNewHabit("");
  };

  return (
    <div>
      {/* form mini para crear hábito */}
      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 bg-slate-900/60 border border-slate-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-emerald-500"
          placeholder="Nuevo hábito (ej: Leer 10 páginas)"
          value={newHabit}
          onChange={(e) => setNewHabit(e.target.value)}
        />
        <select
          className="bg-slate-900/60 border border-slate-800 rounded-xl px-2 text-xs text-slate-300"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as HabitFrequency)}
        >
          <option value="daily">Diario</option>
          <option value="weekly">Semanal</option>
          <option value="custom">Custom</option>
        </select>
        <button
          onClick={handleAdd}
          className="text-xs px-3 rounded-xl bg-emerald-500 text-slate-950 font-semibold hover:bg-emerald-400 transition-colors"
        >
          Añadir
        </button>
      </div>

      {habits.length === 0 && (
        <p className="text-xs text-slate-500">
          Todavía no tenés hábitos. Creá el primero arriba 👆
        </p>
      )}

      {habits.map((h) => {
        const checked = checks.some(
          (c) => c.habitId === h.id && c.date === date
        );
        return (
          <HabitCard
            key={h.id}
            habit={h}
            checked={checked}
            onToggle={() => onToggle(h.id, date)}
          />
        );
      })}
    </div>
  );
}
