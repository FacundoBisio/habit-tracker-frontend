import { useEffect, useState } from "react";
import { nanoid } from "nanoid";
import type { Habit, HabitCheck, HabitFrequency } from "../types/habit";

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

  const addHabit = (name: string, frequency: HabitFrequency) => {
    const newHabit: Habit = {
      id: nanoid(),
      name,
      frequency,
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

  return {
    habits,
    checks,
    addHabit,
    toggleHabitForDate,
  };
}