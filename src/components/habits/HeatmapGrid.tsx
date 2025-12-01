import { motion } from "framer-motion";
import type { HabitCheck } from "../../types/habit";

interface Props {
  checks: HabitCheck[];
  days: string[];
}

export function HeatmapGrid({ checks, days }: Props) {
  const intensity = (date: string) =>
    checks.filter((c) => c.date === date).length;

  return (
    <div className="flex gap-[3px] flex-wrap">
      {days.map((d) => {
        const level = intensity(d);
        const base =
          level === 0
            ? "bg-slate-900"
            : level === 1
            ? "bg-emerald-900"
            : level === 2
            ? "bg-emerald-700"
            : "bg-emerald-500";

        return (
          <motion.div
            key={d}
            className={`w-3 h-3 rounded-[3px] ${base}`}
            whileHover={{ scale: 1.7 }}
            transition={{ type: "spring", stiffness: 200, damping: 18 }}
          />
        );
      })}
    </div>
  );
}
