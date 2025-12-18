import { motion } from "framer-motion";
import { useMemo } from "react";
import { format, eachDayOfInterval, subDays, startOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { Card } from "../ui/Card";
import { cn } from "../../utils/cn";
import type { HabitCheck } from "../../types/habit";

interface HeatmapGridProps {
  checks: HabitCheck[];
  onDayClick?: (date: string) => void;
  selectedDate?: string;
}

export function HeatmapGrid({ checks, onDayClick, selectedDate }: HeatmapGridProps) {
  // Generate last ~3 months of days
  const calendarDays = useMemo(() => {
    const today = new Date();
    const start = subDays(today, 84); // 12 weeks
    // Align to start of week to make grid pretty
    const alignedStart = startOfWeek(start, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: alignedStart, end: today });
  }, []);

  const intensityMap = useMemo(() => {
    const map = new Map<string, number>();
    checks.forEach((c) => {
      const current = map.get(c.date) || 0;
      map.set(c.date, current + 1);
    });
    return map;
  }, [checks]);

  return (
    <Card className="p-4 overflow-x-auto scroller-none">
      <div className="flex gap-1 min-w-max">
         <div className="grid grid-rows-7 grid-flow-col gap-1">
            {calendarDays.map((day) => {
               const dateStr = format(day, "yyyy-MM-dd");
               const count = intensityMap.get(dateStr) || 0;
               
               let colorClass = "bg-slate-800/50";
               if (count > 0) colorClass = "bg-emerald-900/40 border border-emerald-900";
               if (count >= 2) colorClass = "bg-emerald-700/60 border border-emerald-700";
               if (count >= 4) colorClass = "bg-emerald-500 border border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]";

               const isSelected = selectedDate === dateStr;

               return (
                 <motion.button
                   key={dateStr}
                   whileHover={{ scale: 1.2, zIndex: 10 }}
                   onClick={() => onDayClick?.(dateStr)}
                   className={cn(
                     "w-3 h-3 rounded-sm transition-colors relative group",
                     colorClass,
                     isSelected && "ring-2 ring-white z-10"
                   )}
                   title={`${format(day, "EEEE d 'de' MMMM", { locale: es })}: ${count} hábitos`}
                 />
               );
            })}
         </div>
      </div>
      <div className="flex items-center gap-2 mt-4 text-xs text-slate-500 justify-end">
        <span>Menos</span>
        <div className="w-3 h-3 rounded-sm bg-slate-800/50" />
        <div className="w-3 h-3 rounded-sm bg-emerald-900/40" />
        <div className="w-3 h-3 rounded-sm bg-emerald-700/60" />
        <div className="w-3 h-3 rounded-sm bg-emerald-500" />
        <span>Más</span>
      </div>
    </Card>
  );
}
