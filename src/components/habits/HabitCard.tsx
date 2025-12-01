import type { Habit, HabitCheck } from "../../types/habit";

interface Props {
  habit: Habit;
  checked: boolean;
  onToggle: () => void;
}

export function HabitCard({ habit, checked, onToggle }: Props) {
  return (
    <button
      onClick={onToggle}
      className={`w-full flex items-center justify-between rounded-2xl border px-4 py-3 mb-2
      transition-all text-sm
      ${
        checked
          ? "border-emerald-500/70 bg-emerald-500/10"
          : "border-slate-800 bg-slate-900/40 hover:border-slate-700"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-5 h-5 rounded-full border flex items-center justify-center
          ${
            checked
              ? "border-emerald-500 bg-emerald-500/20"
              : "border-slate-600"
          }`}
        >
          {checked && (
            <span className="text-[11px] text-emerald-300 font-semibold">✓</span>
          )}
        </div>
        <span>{habit.name}</span>
      </div>
      <span className="text-[10px] uppercase tracking-wide text-slate-400">
        {habit.frequency}
      </span>
    </button>
  );
}
