import { useMemo } from "react";
import { startOfDay, subDays, isSameDay, parseISO } from "date-fns";
import type { Habit, HabitCheck } from "../types/habit";

export function useGamification(habits: Habit[], checks: HabitCheck[]) {
  const stats = useMemo(() => {
    const today = startOfDay(new Date());
    let currentStreak = 0;
    
    // Simple naive streak calculation: consecutive days with at least 1 habit done
    // This is a basic implementation. A more robust one would require checking *all* daily habits.
    for (let i = 0; i < 365; i++) {
        const date = subDays(today, i);
        const dateStr = date.toISOString().split('T')[0];
        const hasActivity = checks.some(c => c.date === dateStr);
        if (hasActivity) {
            currentStreak++;
        } else if (i === 0 && !hasActivity) {
            // If today has no activity yet, don't break streak from yesterday
            continue; 
        } else {
            break;
        }
    }

    const totalCompletions = checks.length;

    // "Perfect Days": days where all active daily habits were completed
    // This calculation is expensive, so we might optimize later.
    // For now, let's just return check count.
    
    return {
      currentStreak,
      totalCompletions
    };
  }, [checks]);

  return stats;
}
