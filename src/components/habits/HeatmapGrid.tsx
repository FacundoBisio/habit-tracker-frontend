import { motion } from "framer-motion";
import { useMemo } from "react";
import { format, eachDayOfInterval, subDays, startOfWeek, getDay, isSameMonth, addDays } from "date-fns";
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
  // Generate last ~365 days (or less for mobile)
  const { calendarWeeks, monthLabels } = useMemo(() => {
    const today = new Date();
    // Use ~24 weeks to fit without scroll on desktop (approx 168 days)
    const daysToSubtract = 168; 
    const start = subDays(today, daysToSubtract);
    const alignedStart = startOfWeek(start, { weekStartsOn: 1 }); // Monday start
    
    const days = eachDayOfInterval({ start: alignedStart, end: today });
    
    // Group by weeks
    const weeks: Date[][] = [];
    let currentWeek: Date[] = [];
    
    days.forEach((day, i) => {
      const dayOfWeek = getDay(day); // 0 (Sun) to 6 (Sat)
      // If it's Monday (1) and we have days, push old week
      // Or just simple chunking by 7 since we aligned start
      if (i % 7 === 0 && currentWeek.length > 0) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      currentWeek.push(day);
    });
    if (currentWeek.length > 0) weeks.push(currentWeek);

    // Calculate month labels
    const months: { label: string; index: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, i) => {
      const firstDay = week[0];
      const month = firstDay.getMonth();
      if (month !== lastMonth) {
        months.push({ label: format(firstDay, "MMM", { locale: es }), index: i });
        lastMonth = month;
      }
    });

    return { calendarWeeks: weeks, monthLabels: months };
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
    <Card className="p-6 overflow-x-auto scroller-none bg-slate-900/40 border-slate-800">
      <div className="min-w-max">
        {/* Month Labels */}
        <div className="flex mb-2 text-xs text-slate-500 relative h-5">
           {monthLabels.map((m, i) => (
             <span 
                key={`${m.label}-${i}`} 
                style={{ left: `${m.index * 14}px` }} // 14px = 10px width + 4px gap roughly
                className="absolute capitalize"
             >
               {m.label}
             </span>
           ))}
        </div>

        <div className="flex gap-1">
          {/* Day Labels */}
          <div className="flex flex-col gap-1 pr-2 text-[10px] text-slate-500 pt-[14px]">
             <span className="h-[10px] leading-[10px]">Lun</span>
             <span className="h-[10px] leading-[10px] opacity-0">Mar</span>
             <span className="h-[10px] leading-[10px]">Mié</span>
             <span className="h-[10px] leading-[10px] opacity-0">Jue</span>
             <span className="h-[10px] leading-[10px]">Vie</span>
             <span className="h-[10px] leading-[10px] opacity-0">Sáb</span>
             <span className="h-[10px] leading-[10px] opacity-0">Dom</span>
          </div>

          {/* Grid */}
          <div className="flex gap-1">
             {calendarWeeks.map((week, wIndex) => (
                <div key={wIndex} className="flex flex-col gap-1">
                   {week.map((day) => {
                     const dateStr = format(day, "yyyy-MM-dd");
                     const count = intensityMap.get(dateStr) || 0;
                     const isFuture = day > new Date();

                     // Colors similar to GitHub/Contribution generic
                     let colorClass = "bg-slate-800/50";
                     if (count > 0) colorClass = "bg-emerald-900/40 border border-emerald-900";
                     if (count >= 2) colorClass = "bg-emerald-700/60 border border-emerald-700";
                     if (count >= 4) colorClass = "bg-emerald-500 border border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]";
                     
                     if (isFuture) colorClass = "opacity-0 pointer-events-none";

                     const isSelected = selectedDate === dateStr;

                     return (
                       <motion.button
                         key={dateStr}
                         whileHover={{ scale: 1.3, zIndex: 20 }}
                         onClick={() => onDayClick?.(dateStr)}
                         className={cn(
                           "w-[10px] h-[10px] rounded-[2px] transition-colors relative",
                           colorClass,
                           isSelected && "ring-1 ring-white z-10"
                         )}
                         title={`${format(day, "EEEE d 'de' MMMM", { locale: es })}: ${count} hábitos`}
                       />
                     );
                   })}
                </div>
             ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 mt-4 text-[10px] text-slate-500 justify-end">
          <span>Menos</span>
          <div className="w-[10px] h-[10px] rounded-[2px] bg-slate-800/50" />
          <div className="w-[10px] h-[10px] rounded-[2px] bg-emerald-900/40" />
          <div className="w-[10px] h-[10px] rounded-[2px] bg-emerald-700/60" />
          <div className="w-[10px] h-[10px] rounded-[2px] bg-emerald-500" />
          <span>Más</span>
        </div>
      </div>
    </Card>
  );
}
