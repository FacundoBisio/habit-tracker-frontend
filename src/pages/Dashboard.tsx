import { useState, useMemo } from "react";
import { format } from "date-fns";
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
  const { habits, checks, addHabit, toggleHabitForDate, getHabitStats } = useHabits();
  const gamification = useGamification(habits, checks);
  
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const stats = useMemo(() => {
      const isToday = selectedDate === new Date().toISOString().slice(0, 10);
      const habitsForDate = habits.filter(h => !h.archived); // Logic could be more complex
      
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

  const handleToggle = (habitId: string, date: string) => {
      toggleHabitForDate(habitId, date);
      // Optimistic toast ? Maybe too noisy. Let's do it only on completion.
  };
  
  const isToday = selectedDate === new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-20">
      <Toaster position="top-center" theme="dark" />
      
      {/* Header Stats */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="col-span-2 md:col-span-2 flex flex-col justify-center bg-gradient-to-br from-indigo-900/50 to-slate-900/50 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10">
                 <Trophy size={120} />
             </div>
             <div className="relative z-10">
                 <h2 className="text-sm text-indigo-300 font-medium mb-1">Tu Progreso Diario</h2>
                 <div className="flex items-baseline gap-2">
                     <span className="text-4xl font-bold text-white">{stats.progress}%</span>
                     <span className="text-sm text-slate-400">completado</span>
                 </div>
                 <div className="h-1.5 w-full bg-slate-800/50 rounded-full mt-3 overflow-hidden">
                     <div 
                        className="h-full bg-indigo-500 transition-all duration-1000 ease-out"
                        style={{ width: `${stats.progress}%` }} 
                     />
                 </div>
             </div>
        </Card>
        
        <Card className="flex flex-col justify-center items-center p-6 bg-orange-950/20 border-orange-900/30">
            <Flame className="text-orange-500 mb-2" size={32} />
            <span className="text-2xl font-bold text-white">{gamification.currentStreak}</span>
            <span className="text-xs text-orange-300/60 uppercase tracking-wider font-semibold">Racha Actual</span>
        </Card>
        
        <Card className="flex flex-col justify-center items-center p-6 bg-emerald-950/20 border-emerald-900/30">
            <Trophy className="text-emerald-500 mb-2" size={32} />
            <span className="text-2xl font-bold text-white">{gamification.totalCompletions}</span>
            <span className="text-xs text-emerald-300/60 uppercase tracking-wider font-semibold">Total Hábitos</span>
        </Card>
      </section>

      {/* Main Content Area */}
      <div className="grid md:grid-cols-[1fr_300px] gap-8">
          {/* Left: Habits List */}
          <section className="space-y-6">
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
                getStats={getHabitStats}
             />
          </section>

          {/* Right: Calendar/Heatmap & Sidebar */}
          <aside className="space-y-6">
              <div className="sticky top-8">
                  <h3 className="text-sm font-medium text-slate-400 mb-3 flex items-center gap-2">
                      <CalendarIcon size={16} />
                      Consistencia
                  </h3>
                  <HeatmapGrid 
                     checks={checks} 
                     onDayClick={setSelectedDate}
                     selectedDate={selectedDate}
                  />
                  
                  <div className="mt-6 p-4 rounded-2xl bg-slate-900/50 border border-slate-800 text-xs text-slate-400 leading-relaxed">
                      💡 <strong>Tip:</strong> Intenta no romper la cadena. La consistencia es clave para formar nuevos hábitos.
                  </div>
              </div>
          </aside>
      </div>

      <AddHabitModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={addHabit}
      />
    </div>
  );
}
