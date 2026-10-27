"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { m } from "framer-motion";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import type { StripDay } from "@/lib/store/day";

/** Tira de los últimos 14 días: tocá uno para ver y corregir ese día. El seleccionado va en píldora. */
export function WeekStrip({ days, selected, onSelect }: { days: StripDay[]; selected: string; onSelect: (date: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useEffect(() => {
    // Al montar, mostrar el final (hoy); después, mantener el día elegido a la vista.
    const el = box.current;
    if (!el) return;
    const btn = el.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (first.current) {
      el.scrollLeft = el.scrollWidth;
      first.current = false;
    } else btn?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <div ref={box} className="-mx-5 mb-5 flex gap-1 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Elegir día">
      {days.map((d) => {
        const active = d.date === selected;
        const date = parseISO(d.date);
        const full = d.scheduled > 0 && d.done === d.scheduled;
        const partial = d.done > 0 && !full;
        return (
          <button
            key={d.date}
            aria-pressed={active}
            aria-label={`${format(date, "EEEE d 'de' MMMM", { locale: es })}${full ? ", completo" : ""}`}
            onClick={() => onSelect(d.date)}
            className={cn(
              "relative flex min-h-[72px] w-[52px] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl transition-colors",
              active ? "text-bg" : "text-muted hover:text-fg",
            )}
          >
            {active && (
              <m.span
                layoutId="day-pill"
                className="absolute inset-0 rounded-2xl bg-fg shadow-lg"
                transition={{ type: "spring", stiffness: 480, damping: 34 }}
              />
            )}
            <span className="relative text-[11px] font-medium">{format(date, "EEE", { locale: es }).replace(".", "")}</span>
            <span className="font-display relative text-lg leading-none font-semibold tabular-nums">{format(date, "d")}</span>
            <span
              className={cn("relative size-1.5 rounded-full", d.scheduled === 0 && "opacity-0")}
              style={{
                background: active
                  ? `color-mix(in srgb, var(--bg) ${full ? 100 : partial ? 55 : 25}%, transparent)`
                  : full
                    ? "var(--accent)"
                    : partial
                      ? "color-mix(in srgb, var(--accent) 45%, transparent)"
                      : "var(--border)",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
