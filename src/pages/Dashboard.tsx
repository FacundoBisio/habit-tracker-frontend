import { useHabits } from "../hooks/useHabits";
import { HabitList } from "../components/habits/HabitList";
import { HeatmapGrid } from "../components/habits/HeatmapGrid";
import { getLastNDays } from "../utils/date";

export function Dashboard() {
  const { habits, checks, addHabit, toggleHabitForDate } = useHabits();

  const today = new Date().toISOString().slice(0, 10);
  const days = getLastNDays(84); // 12 semanas aprox

  const todayChecks = checks.filter((c) => c.date === today);
  const progressToday =
    habits.length === 0
      ? 0
      : Math.round((todayChecks.length / habits.length) * 100);

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-semibold mb-2">Hoy</h1>
        <p className="text-sm text-slate-400 mb-4">
          Marca tus hábitos diarios y mira tu racha crecer.
        </p>

        {/* Barra de progreso */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-slate-400 mb-1">
            <span>Progreso de hoy</span>
            <span>{progressToday}%</span>
          </div>
          <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${progressToday}%` }}
            />
          </div>
        </div>

        <HabitList
          habits={habits}
          checks={checks}
          date={today}
          onToggle={toggleHabitForDate}
          onAddHabit={addHabit}
        />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">
          Mapa de consistencia (últimas semanas)
        </h2>
        <HeatmapGrid checks={checks} days={days} />
      </section>
    </div>
  );
}
