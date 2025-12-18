import { motion } from "framer-motion";
import { Check, Flame, Trophy } from "lucide-react";
import { Card } from "../ui/Card";
import { cn } from "../../utils/cn";
import type { Habit } from "../../types/habit";

interface HabitCardProps {
  habit: Habit;
  completed: boolean;
  streak: number;
  stats: {
    target: number;
    current: number;
  };
  onToggle: () => void;
}

export function HabitCard({ habit, completed, streak, stats, onToggle }: HabitCardProps) {
  // Determine color theme based on habit color or default
  // For now, using a dynamic utility class approach might be tricky with purging, 
  // so we'll map a few presets or just use inline styles for specifics.
  
  return (
    <Card className="group relative overflow-hidden transition-all hover:glass-hover">
      <div className="flex items-center gap-4">
        {/* Check Button */}
        <button
          onClick={onToggle}
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950",
            completed
              ? "border-emerald-500 bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]"
              : "border-slate-700 bg-slate-800/50 text-transparent hover:border-emerald-500/50"
          )}
        >
          <motion.div
            initial={false}
            animate={{ scale: completed ? 1 : 0.5, opacity: completed ? 1 : 0 }}
          >
            <Check strokeWidth={3} size={20} />
          </motion.div>
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className={cn("font-medium truncate text-lg transition-colors", completed ? "text-slate-400 line-through" : "text-slate-100")}>
            {habit.name}
          </h3>
          <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
            <span className="flex items-center gap-1">
               {habit.frequency.type === 'daily' ? 'Diario' : `${habit.frequency.target}x / sem`}
            </span>
            {streak > 0 && (
                <span className="flex items-center gap-1 text-orange-400 font-medium">
                    <Flame size={12} /> {streak} d
                </span>
            )}
            {stats.target > 1 && (
                <span className="flex items-center gap-1 text-blue-400 ml-auto">
                    {stats.current} / {stats.target}
                </span>
            )}
          </div>
        </div>
      </div>
          
      {/* Progress Bar (if weekly) */}
      {stats.target > 1 && (
         <div className="absolute bottom-0 left-0 h-1 w-full bg-slate-800/50">
             <motion.div 
                className="h-full bg-blue-500"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (stats.current / stats.target) * 100)}%` }}
             />
         </div>
      )}
    </Card>
  );
}
