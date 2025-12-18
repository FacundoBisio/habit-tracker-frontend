import { useEffect, useState, useMemo } from "react";
import { nanoid } from "nanoid";
import { startOfWeek, endOfWeek, isWithinInterval, parseISO } from "date-fns";
import type { Habit, HabitCheck, HabitFrequency, HabitCategory } from "../types/habit";

const HABITS_KEY = "habit-tracker:habits";
const CHECKS_KEY = "habit-tracker:checks";

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function useHabits() {
  const [habits, setHabits] = useState<Habit[]>(() =>
    load<Habit[]>(HABITS_KEY, [])
  );
  const [checks, setChecks] = useState<HabitCheck[]>(() =>
    load<HabitCheck[]>(CHECKS_KEY, [])
  );

  useEffect(() => {
    localStorage.setItem(HABITS_KEY, JSON.stringify(habits));
  }, [habits]);

  useEffect(() => {
    localStorage.setItem(CHECKS_KEY, JSON.stringify(checks));
  }, [checks]);

  const addHabit = (
    name: string,
    frequency: HabitFrequency,
    category: HabitCategory = "other",
    color: string = "gray",
    icon: string = "activity"
  ) => {
    const newHabit: Habit = {
      id: nanoid(),
      name,
      frequency,
      category,
      color,
      icon,
      archived: false,
      createdAt: new Date().toISOString(),
    };
    setHabits((prev) => [...prev, newHabit]);
  };

  const toggleHabitForDate = (habitId: string, date: string) => {
    setChecks((prev) => {
      const existing = prev.find(
        (c) => c.habitId === habitId && c.date === date
      );
      if (existing) {
        return prev.filter((c) => c.id !== existing.id);
      }
      return [...prev, { id: nanoid(), habitId, date }];
    });
  };

  const getHabitStats = (habit: Habit, date: string) => {
    if (habit.frequency.type === "daily") {
      const isCompleted = checks.some(
        (c) => c.habitId === habit.id && c.date === date
      );
      return { completed: isCompleted, target: 1, current: isCompleted ? 1 : 0 };
    } else {
      // Weekly logic
      const targetDate = parseISO(date);
      const start = startOfWeek(targetDate, { weekStartsOn: 1 });
      const end = endOfWeek(targetDate, { weekStartsOn: 1 });
      
      const weeklyChecks = checks.filter((c) => {
        if (c.habitId !== habit.id) return false;
        const checkDate = parseISO(c.date);
        return isWithinInterval(checkDate, { start, end });
      });

      const count = weeklyChecks.length;
      return {
        completed: count >= habit.frequency.target,
        target: habit.frequency.target,
        current: count,
      };
    }
  };

  return {
    habits,
    checks,
    addHabit,
    toggleHabitForDate,
    getHabitStats,
  };
}