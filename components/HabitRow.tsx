"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Flame, Minus, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { fmt, haptic, streakColor, unitLabel } from "@/lib/cn";
import { confettiFrom } from "@/lib/confetti";
import type { DayRow } from "@/lib/store/day";
import { IconChip } from "./HabitIcon";

const LONG_PRESS_MS = 450;

function usePress(onTap: () => void, onLong: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);
  const cancel = () => timer.current && clearTimeout(timer.current);
  return {
    onPointerDown: () => {
      fired.current = false;
      timer.current = setTimeout(() => {
        fired.current = true;
        haptic(25);
        onLong();
      }, LONG_PRESS_MS);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => {
      if (fired.current) return;
      haptic(10);
      onTap();
    },
  };
}

function CheckMark() {
  return (
    <motion.span
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 600, damping: 22 }}
      className="grid size-9 place-items-center rounded-full bg-accent text-accent-fg shadow-md"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
        <motion.path d="M5 12.5l4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.28, delay: 0.05 }} />
      </svg>
    </motion.span>
  );
}

function Subtitle({ row }: { row: DayRow }) {
  const { habit, todayTotal, streak, weekly } = row;
  const parts: React.ReactNode[] = [];
  if (habit.kind === "boolean" && todayTotal > 0) {
    parts.push(
      <span key="d" className="inline-flex items-center gap-1 font-medium text-fg">
        <Check className="size-3" strokeWidth={3} />
        Hecho
      </span>,
    );
  }
  if (habit.kind === "quantity") {
    parts.push(
      <span key="q">
        {fmt(todayTotal)}
        {habit.unit ? ` ${unitLabel(todayTotal, habit.unit)}` : ""} hoy
      </span>,
    );
  }
  if (weekly) parts.push(<span key="w">{weekly.done}/{weekly.target} esta semana</span>);
  if (streak > 1) {
    parts.push(
      <span
        key="s"
        className="inline-flex items-center gap-0.5"
        style={streakColor(streak) ? { color: streakColor(streak), fontWeight: 700 } : undefined}
        aria-label={`Racha de ${streak}`}
      >
        <Flame className="size-3.5" fill={streakColor(streak) ? "currentColor" : "none"} fillOpacity={0.3} />
        {streak}
      </span>,
    );
  }
  if (!parts.length) return null;
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-x-2">
          {i > 0 && <span className="size-0.5 rounded-full bg-muted" />}
          {p}
        </span>
      ))}
    </span>
  );
}

export function HabitRow({
  row,
  onToggle,
  onAdjust,
  onOpen,
}: {
  row: DayRow;
  onToggle: () => void;
  onAdjust: (delta: number) => void;
  onOpen: () => void;
}) {
  const { habit, todayTotal } = row;
  const qty = habit.kind === "quantity";
  const done = todayTotal > 0;
  const press = usePress(qty ? onOpen : onToggle, onOpen);
  const unit = habit.unit ?? "";
  const anchor = useRef<HTMLSpanElement>(null);
  const wasDone = useRef(done);
  useEffect(() => {
    // Confeti solo cuando el hábito pasa de pendiente a hecho (no al montar ni al cambiar de día).
    if (done && !wasDone.current) confettiFrom(anchor.current);
    wasDone.current = done;
  }, [done]);

  return (
    <div className="card relative overflow-hidden rounded-[1.4rem]">
      <div className="relative flex items-center">
        <button
          className="no-select flex min-h-[72px] min-w-0 flex-1 items-center gap-3.5 rounded-[1.4rem] p-3 text-left transition-transform active:scale-[0.985]"
          aria-label={
            qty
              ? `${habit.name}, ${fmt(todayTotal)} ${unit} hoy. Tocá para corregir el total`
              : `${habit.name}${done ? ", hecho" : ""}. Mantené presionado para más opciones`
          }
          {...press}
        >
          <IconChip value={habit.emoji} on={done} />
          <span className="min-w-0 flex-1">
            <span className="font-display relative block w-fit max-w-full truncate text-[17px] font-semibold tracking-tight">
              {habit.name}
              {!qty && (
                <motion.span
                  aria-hidden
                  className="absolute top-1/2 left-0 h-[2px] w-full origin-left rounded-full bg-fg/55"
                  initial={false}
                  animate={{ scaleX: done ? 1 : 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                />
              )}
            </span>
            <Subtitle row={row} />
          </span>
          {!qty && (
            <span ref={anchor} className="grid size-9 shrink-0 place-items-center">
              {done ? <CheckMark /> : <span className="size-9 rounded-full border-2 border-border transition-colors" />}
            </span>
          )}
        </button>

        {qty && (
          <div className="flex shrink-0 items-center gap-0.5 pr-2.5">
            <button
              aria-label={`Restar ${fmt(habit.defaultAmount)} ${unit} a ${habit.name}`}
              disabled={!done}
              onClick={() => {
                haptic(8);
                onAdjust(-Math.min(habit.defaultAmount, todayTotal));
              }}
              className="grid size-11 place-items-center rounded-full bg-surface-2 text-fg transition active:scale-90 disabled:opacity-30"
            >
              <Minus className="size-[18px]" strokeWidth={2.4} />
            </button>
            <span className="font-display relative grid h-11 min-w-9 place-items-center overflow-hidden px-1 text-lg font-semibold tabular-nums">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={todayTotal}
                  initial={{ y: 14, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -14, opacity: 0 }}
                  transition={{ duration: 0.16 }}
                >
                  {fmt(todayTotal)}
                </motion.span>
              </AnimatePresence>
            </span>
            <span ref={anchor} className="relative grid">
              <button
                aria-label={`Sumar ${fmt(habit.defaultAmount)} ${unit} a ${habit.name}`}
                onClick={() => {
                  haptic(10);
                  onAdjust(habit.defaultAmount);
                }}
                className="grid size-11 place-items-center rounded-full bg-accent text-accent-fg shadow-md transition active:scale-90"
              >
                <Plus className="size-[18px]" strokeWidth={2.6} />
              </button>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
