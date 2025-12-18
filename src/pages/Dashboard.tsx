import { useState, useMemo } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { toast, Toaster } from "sonner";
import { Trophy, Flame, Calendar as CalendarIcon } from "lucide-react";
import { useHabits } from "../hooks/useHabits";
import { useGamification } from "../hooks/useGamification";
import { HabitList } from "../components/habits/HabitList";
import { HeatmapGrid } from "../components/habits/HeatmapGrid";
import { AddHabitModal } from "../components/habits/AddHabitModal";
import { Card } from "../components/ui/Card";

export function Dashboard() {
  const { habits, checks, addHabit, updateHabit, deleteHabit, toggleHabitForDate, getHabitStats } = useHabits();
  const gamification = useGamification(habits, checks);
  
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const stats = useMemo(() => {
      const isToday = selectedDate === new Date().toISOString().slice(0, 10);
      const habitsForDate = habits.filter(h => !h.archived);
      
      const completedCount = habitsForDate.reduce((acc, h) => {
         const s = getHabitStats(h, selectedDate);
         return acc + (s.completed ? 1 : 0);
      }, 0);
      
      const progress = habitsForDate.length > 0 
        ? Math.round((completedCount / habitsForDate.length) * 100) 
        : 0;
        
      if (isToday && progress === 100 && habitsForDate.length > 0) {
          // Could trigger confetti here if state changed
      }
      
      return { progress, completedCount, total: habitsForDate.length };
  }, [habits, checks, selectedDate, getHabitStats]);

  // Level System Calculation
  // Level = sqrt(totalCompletions / 3) approximately, making it harder to level up
  // simple gamification logic inline for now
  const level = Math.floor(Math.sqrt(gamification.totalCompletions) * 0.5) + 1;
  const currentLevelXp = gamification.totalCompletions;
  // XP need for next level (inverse of level formula) -> ((level + 1) / 0.5)^2
  const nextLevelThreshold = Math.pow((level) / 0.5 + 2, 2); 
  // Let's make it simpler: constant 10 XP per level for demo or simple curve
  // Level N requires N * 10 completions total? No, linear is boring.
  // Quadratic: Level 1 = 0-9, Level 2 = 10-24, Level 3 = 25...
  
  const prevLevelThreshold = Math.pow((level - 1) / 0.5, 2);
  const nextLevelXpTotal = Math.pow(level / 0.5, 2);
  
  // Progress within current level
  const levelProgress = Math.min(100, Math.max(0, 
    ((gamification.totalCompletions - prevLevelThreshold) / (nextLevelXpTotal - prevLevelThreshold || 1)) * 100
  ));

  const handleToggle = (habitId: string, date: string) => {
      toggleHabitForDate(habitId, date);
  };
  
  const isToday = selectedDate === new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8 pb-20">
      <Toaster position="top-center" theme="dark" />
      
      {/* Header Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="col-span-2 md:col-span-2 flex flex-col justify-center bg-gradient-to-br from-indigo-900/50 to-slate-900/50 relative overflow-hidden p-6">
             <div className="absolute top-0 right-0 p-4 opacity-10">
                 <Trophy size={120} />
             </div>
             <div className="relative z-10">
                 <h2 className="text-indigo-200 font-medium mb-0.5">Tu Rendimiento Diario</h2>
                 <p className="text-xs text-indigo-400/80 mb-3">Cada paso cuenta para tu éxito.</p>
                 <div className="flex items-baseline gap-2">
                     <span className="text-5xl font-bold text-white tracking-tight">{stats.progress}%</span>
                     <span className="text-sm text-slate-400 font-medium">del objetivo</span>
                 </div>
                 <div className="h-1.5 w-full bg-slate-800/50 rounded-full mt-3 overflow-hidden">
                     <div 
                        className="h-full bg-indigo-500 transition-all duration-1000 ease-out"
                        style={{ width: `${stats.progress}%` }} 
                     />
                 </div>
             </div>
        </Card>
        
        <Card className="flex flex-col justify-center items-center p-6 bg-slate-900/50 border-slate-800 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-t from-orange-500/10 to-transparent opacity-50 group-hover:opacity-100 transition-opacity" />
            <Flame className="text-orange-500 mb-2" size={32} />
            <span className="text-2xl font-bold text-white">{gamification.currentStreak}</span>
            <span className="text-xs text-orange-400/80 uppercase tracking-wider font-bold">Racha (Días)</span>
        </Card>
        
        <Card className="flex flex-col justify-center p-6 bg-slate-900/50 border-slate-800 relative overflow-hidden">
            <div className="text-xs text-emerald-400 font-bold uppercase tracking-wider mb-1 flex justify-between">
                <span>Nivel {level}</span>
                <span>{Math.round(levelProgress)}% EXP</span>
            </div>
            <div className="flex items-center gap-2 mb-2">
                 <span className="text-2xl font-bold text-white">{gamification.totalCompletions}</span>
                 <span className="text-xs text-slate-500">hábitos total</span>
            </div>
            <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                 <div 
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
                    style={{ width: `${levelProgress}%` }}
                 />
            </div>
        </Card>
      </section>

      {/* Main Content Area: Habits List (Centered) */}
      <section className="max-w-3xl mx-auto space-y-6">
         <header className="flex items-center justify-between">
            <div>
               <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  {isToday ? "Objetivos de Hoy" : `Historial: ${format(parseISO(selectedDate), "d 'de' MMMM", { locale: es })}`}
               </h2>
               <p className="text-slate-400 text-sm">
                  {isToday 
                    ? "Mantén tu racha viva completando tus objetivos." 
                    : "Revisando tu actividad pasada."}
               </p>
            </div>
            {!isToday && (
                <button 
                    onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
                    className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                    Volver a Hoy
                </button>
            )}
         </header>

         <HabitList
            habits={habits}
            checks={checks}
            date={selectedDate}
            onToggle={handleToggle}
            onAdd={() => setIsAddModalOpen(true)}
            onUpdate={updateHabit}
            onDelete={deleteHabit}
            getStats={getHabitStats}
         />
      </section>

      {/* Footer Area: Calendar/Heatmap */}
      <section className="space-y-4 pt-8 border-t border-white/5">
          <div className="flex items-center gap-2 mb-4">
              <CalendarIcon className="text-slate-400" size={20} />
              <h3 className="text-lg font-medium text-slate-200">Consistencia Anual</h3>
          </div>
          
          <HeatmapGrid 
             checks={checks} 
             onDayClick={setSelectedDate}
             selectedDate={selectedDate}
          />
          
          <div className="text-center text-xs text-slate-500 mt-4">
             Persistencia es lo que convierte lo imposible en posible.
          </div>
      </section>

      <AddHabitModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={addHabit}
      />
    </div>
  );
}
