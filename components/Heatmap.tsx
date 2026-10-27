"use client";

import { useLayoutEffect, useRef } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { addDays } from "@/lib/domain/dates";
import { heatmapRange, monthStartingIn } from "@/lib/domain/heatmap";
import type { WeekStart } from "@/lib/domain/types";

/**
 * Mapa de calor desde el mes en que empezaste a usar la app (tope ~1 año): columnas = semanas,
 * filas = días. Intensidad relativa al máximo diario. Si no entra, arranca desplazado hasta hoy.
 */
export function Heatmap({
  totals,
  today,
  firstDate,
  weekStartsOn,
}: {
  totals: Map<string, number>;
  today: string;
  firstDate: string | undefined;
  weekStartsOn: WeekStart;
}) {
  const { from, weeks } = heatmapRange(firstDate, today, weekStartsOn);
  const max = Math.max(1, ...totals.values());
  const scroller = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [from, today]);

  return (
    <div
      ref={scroller}
      className="overflow-x-auto pb-1"
      role="img"
      aria-label={`Mapa de calor desde ${format(parseISO(from), "MMMM 'de' yyyy", { locale: es })}`}
    >
      <div className="flex w-max gap-[3px]">
        {weeks.map((weekStart) => {
          const month = monthStartingIn(weekStart, from) ?? (weekStart === weeks[0] ? from : undefined);
          return (
            <div key={weekStart} className="flex flex-col gap-[3px]">
              <span className="relative h-3.5 w-3" aria-hidden>
                {month && (
                  <span className="absolute left-0 top-0 whitespace-nowrap text-[10px] leading-none text-muted">
                    {format(parseISO(month), month.endsWith("-01-01") ? "MMM yy" : "MMM", { locale: es })}
                  </span>
                )}
              </span>
              {Array.from({ length: 7 }, (_, d) => {
                const date = addDays(weekStart, d);
                if (date > today || date < from) return <span key={d} className="size-3" />;
                const v = totals.get(date) ?? 0;
                const alpha = v === 0 ? 0 : 0.25 + 0.75 * (v / max);
                return (
                  <span
                    key={d}
                    title={`${format(parseISO(date), "d MMM yyyy", { locale: es })}: ${v}`}
                    className="size-3 rounded-[3px] bg-surface-2"
                    style={v > 0 ? { background: `color-mix(in srgb, var(--accent) ${Math.round(alpha * 100)}%, transparent)` } : undefined}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
