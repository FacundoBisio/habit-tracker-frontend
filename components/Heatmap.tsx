"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { addDays, startOfWeek } from "@/lib/domain/dates";
import type { WeekStart } from "@/lib/domain/types";

/** Heatmap de ~1 año: columnas = semanas, filas = días. Intensidad relativa al máximo diario. */
export function Heatmap({
  totals,
  today,
  weekStartsOn,
  color,
}: {
  totals: Map<string, number>;
  today: string;
  weekStartsOn: WeekStart;
  color: string;
}) {
  const firstWeek = addDays(startOfWeek(today, weekStartsOn), -52 * 7);
  const weeks = Array.from({ length: 53 }, (_, w) => addDays(firstWeek, w * 7));
  const max = Math.max(1, ...totals.values());

  return (
    <div className="overflow-x-auto pb-1" role="img" aria-label="Mapa de calor del último año">
      <div className="flex w-max gap-[3px]">
        {weeks.map((weekStart) => (
          <div key={weekStart} className="flex flex-col gap-[3px]">
            {Array.from({ length: 7 }, (_, d) => {
              const date = addDays(weekStart, d);
              if (date > today) return <span key={d} className="size-3" />;
              const v = totals.get(date) ?? 0;
              const alpha = v === 0 ? 0 : 0.25 + 0.75 * (v / max);
              return (
                <span
                  key={d}
                  title={`${format(parseISO(date), "d MMM yyyy", { locale: es })}: ${v}`}
                  className="size-3 rounded-[3px] bg-surface-2"
                  style={v > 0 ? { background: `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)` } : undefined}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
