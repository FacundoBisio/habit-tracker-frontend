"use client";

import { motion } from "framer-motion";

/** Anillo de avance del día en verde. */
export function Ring({ done, total, size = 76 }: { done: number; total: number; size?: number }) {
  const pct = total ? done / total : 0;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label="Hábitos del día"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - pct), stroke: "var(--accent)" }}
          transition={{ type: "spring", stiffness: 90, damping: 20 }}
        />
      </svg>
      <motion.span
        key={done}
        initial={{ scale: 0.8, opacity: 0.4 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 18 }}
        className="font-display absolute text-xl leading-none font-semibold tabular-nums"
      >
        {done}
        <span className="text-sm font-medium text-muted">/{total}</span>
      </motion.span>
    </div>
  );
}
