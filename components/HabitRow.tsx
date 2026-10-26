"use client";

import { Check, Plus } from "lucide-react";
import { useRef } from "react";
import { cn, fmt, haptic } from "@/lib/cn";
import { HABIT_COLORS } from "./HabitForm";
import type { Habit } from "@/lib/store/db";

export interface RowState {
  todayTotal: number;
  streak: number;
  /** Para weekly: "2/3 esta semana". */
  weekly?: { done: number; target: number };
}

const LONG_PRESS_MS = 450;

export function HabitRow({
  habit,
  state,
  onTap,
  onLongPress,
}: {
  habit: Habit;
  state: RowState;
  onTap: () => void;
  onLongPress: () => void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const qty = habit.kind === "quantity";
  const done = state.todayTotal > 0;
  const hex = HABIT_COLORS[habit.color] ?? HABIT_COLORS.teal;

  const start = () => {
    fired.current = false;
    timer.current = setTimeout(() => {
      fired.current = true;
      haptic(25);
      onLongPress();
    }, LONG_PRESS_MS);
  };
  const cancel = () => timer.current && clearTimeout(timer.current);

  const subtitle = [
    qty ? `${fmt(state.todayTotal)}${habit.unit ? ` ${habit.unit}` : ""} hoy` : null,
    state.weekly ? `${state.weekly.done}/${state.weekly.target} esta semana` : null,
    state.streak > 1 ? `🔥 ${state.streak}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <button
      className={cn(
        "no-select flex min-h-[68px] w-full items-center gap-3.5 rounded-2xl border border-border bg-surface p-3 text-left transition active:scale-[0.985]",
        done && !qty && "bg-accent-soft/60",
      )}
      aria-label={`${habit.name}${done ? ", hecho" : ""}. Mantené presionado para más opciones`}
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => {
        if (fired.current) return;
        haptic(10);
        onTap();
      }}
    >
      <span
        className="grid size-11 shrink-0 place-items-center rounded-xl text-[22px]"
        style={{ background: `color-mix(in srgb, ${hex} 16%, transparent)` }}
      >
        {habit.emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{habit.name}</span>
        {subtitle && <span className="block truncate text-xs text-muted">{subtitle}</span>}
      </span>
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full border transition",
          done ? "border-transparent text-white" : "border-border text-muted",
        )}
        style={done ? { background: hex } : undefined}
      >
        {done && !qty ? <Check className="size-5" strokeWidth={3} /> : qty ? (
          done ? <span className="text-xs font-semibold">{fmt(state.todayTotal)}</span> : <Plus className="size-5" />
        ) : null}
      </span>
    </button>
  );
}
