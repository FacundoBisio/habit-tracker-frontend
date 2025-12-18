import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { HabitCard } from "./HabitCard";
import { EditHabitModal } from "./EditHabitModal";
import { Button } from "../ui/Button";
import type { Habit, HabitCheck } from "../../types/habit";

interface HabitListProps {
  habits: Habit[];
  checks: HabitCheck[];
  date: string;
  onToggle: (habitId: string, date: string) => void;
  onAdd: () => void;
  onUpdate: (id: string, updates: Partial<Habit>) => void;
  onDelete: (id: string) => void;
  getStats: (habit: Habit, date: string) => { completed: boolean; target: number; current: number };
}

export function HabitList({ habits, checks, date, onToggle, onAdd, onUpdate, onDelete, getStats }: HabitListProps) {
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);

  // Sort: Incomplete first, then completed
  const sortedHabits = [...habits].sort((a, b) => {
    const statsA = getStats(a, date);
    const statsB = getStats(b, date);
    if (statsA.completed === statsB.completed) return 0;
    return statsA.completed ? 1 : -1;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
         <h2 className="text-xl font-semibold text-slate-100">Tus Hábitos</h2>
         <Button onClick={onAdd} size="sm" variant="secondary" className="gap-2">
           <Plus size={16} />
           Nuevo
         </Button>
      </div>

      <div className="grid gap-3">
        <AnimatePresence mode="popLayout">
          {sortedHabits.map((habit) => {
             const stats = getStats(habit, date);
             return (
               <motion.div
                 key={habit.id}
                 layout
                 initial={{ opacity: 0, x: -20 }}
                 animate={{ opacity: 1, x: 0 }}
                 exit={{ opacity: 0, scale: 0.9 }}
               >
                 <HabitCard 
                    habit={habit}
                    completed={stats.completed}
                    stats={stats}
                    streak={0} // To implement properly later
                    onToggle={() => onToggle(habit.id, date)}
                    onEdit={() => setEditingHabit(habit)}
                 />
               </motion.div>
             );
          })}
        </AnimatePresence>
        
        {habits.length === 0 && (
            <motion.div 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }}
               className="text-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-2xl"
            >
                <p>No tienes hábitos activos hoy.</p>
                <Button variant="ghost" className="mt-2" onClick={onAdd}>Empezar ahora</Button>
            </motion.div>
        )}
      </div>

      <EditHabitModal 
        isOpen={!!editingHabit}
        habit={editingHabit}
        onClose={() => setEditingHabit(null)}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    </div>
  );
}
