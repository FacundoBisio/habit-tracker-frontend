"use client";

import { useEffect, useMemo } from "react";
import { computeAchievements, type Achievement } from "@/lib/domain/achievements";
import { fireConfetti } from "@/lib/confetti";
import { toast } from "@/lib/notify";
import { useEntriesState, useGoals, useHabitsState, useSettings, useToday } from "./hooks";

const SEEN_KEY = "achievements-seen";

export function useAchievements(): { list: Achievement[]; ready: boolean } {
  const { habits, ready: habitsReady } = useHabitsState(true);
  const { entries, ready: entriesReady } = useEntriesState();
  const goals = useGoals();
  const { weekStartsOn } = useSettings();
  const today = useToday();

  const list = useMemo(
    () => computeAchievements({ habits, entries, goals, today, weekStartsOn }),
    [habits, entries, goals, today, weekStartsOn],
  );
  return { list, ready: habitsReady && entriesReady };
}

function readSeen(): string[] | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function writeSeen(ids: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    /* almacenamiento bloqueado: se avisará de nuevo en la próxima sesión */
  }
}

/**
 * Avisa cuando se desbloquea un logro nuevo. La primera vez que corre en un dispositivo solo
 * registra lo que ya estaba desbloqueado (no avisa de logros viejos).
 */
export function useAchievementUnlocks() {
  const { list, ready } = useAchievements();

  useEffect(() => {
    if (!ready) return;
    const unlocked = list.filter((a) => a.unlocked);
    const seen = readSeen();
    if (!seen) {
      writeSeen(unlocked.map((a) => a.id));
      return;
    }
    const fresh = unlocked.filter((a) => !seen.includes(a.id));
    if (!fresh.length) return;
    writeSeen([...seen, ...fresh.map((a) => a.id)]);
    // Muchos de golpe (p. ej. tras importar datos): un solo aviso en vez de inundar la cola.
    if (fresh.length > 2) toast.success(`${fresh.length} logros desbloqueados. Mirá Ajustes`, { duration: 5000 });
    else for (const a of fresh) toast.success(`Logro desbloqueado: ${a.title}`, { duration: 5000 });
    fireConfetti(window.innerWidth / 2, 110, 36);
  }, [list, ready]);
}
