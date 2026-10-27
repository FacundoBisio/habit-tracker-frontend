"use client";

import { useSyncExternalStore } from "react";
import type { Activity } from "./mascot";

// ---------------------------------------------------------------------------------------------
// Pasos del recorrido guiado (lógica pura: el componente `Tour` solo dibuja)
// ---------------------------------------------------------------------------------------------

/** Partes de la pantalla que señala el recorrido (`data-tour="..."`). */
export type TourAnchor =
  | "crear-habito"
  | "fila-habito"
  | "anillo"
  | "semana"
  | "nav-semana"
  | "nav-objetivos"
  | "nav-stats"
  | "nav-ajustes";

export interface TourStep {
  id: string;
  anchor: TourAnchor;
  text: string;
  activity: Activity;
  /** El paso sigue solo cuando pasa esto (y mientras tanto "Siguiente" no avanza). */
  waitFor?: "habit";
  /** Solo se muestra si todavía no hay hábitos. */
  onlyWithoutHabits?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  { id: "crear", anchor: "crear-habito", text: "Elegí un hábito para arrancar o creá el tuyo.", activity: "wave", waitFor: "habit", onlyWithoutHabits: true },
  { id: "tocar", anchor: "fila-habito", text: "Tocá un hábito para marcarlo hecho. Mirá lo que hago.", activity: "wave" },
  { id: "mantener", anchor: "fila-habito", text: "Mantené presionado para corregir la cantidad o ver el detalle.", activity: "idle" },
  { id: "anillo", anchor: "anillo", text: "Este anillo es tu avance de hoy.", activity: "celebrate" },
  { id: "semana", anchor: "semana", text: "Acá ves la semana. Tocá un día para corregirlo.", activity: "idle" },
  { id: "objetivos", anchor: "nav-objetivos", text: "En Objetivos ponés metas, por ejemplo 20 entrenamientos en el mes.", activity: "lift" },
  { id: "ajustes", anchor: "nav-ajustes", text: "En Ajustes cambiás tu nombre y el tema, conectás Telegram y podés volver a ver esto.", activity: "wave" },
];

export interface TourContext {
  hasHabits: boolean;
  /** ¿Está en pantalla el elemento señalado? */
  has: (anchor: TourAnchor) => boolean;
}

/** ¿Se puede mostrar este paso ahora? (un ancla que no está nunca queda señalando a la nada). */
export function stepAvailable(step: TourStep, ctx: TourContext): boolean {
  if (step.onlyWithoutHabits && ctx.hasHabits) return false;
  return ctx.has(step.anchor);
}

/**
 * Índice del próximo paso disponible desde `from` en la dirección `dir` (incluido `from`), o -1 si no queda
 * ninguno (fin del recorrido hacia adelante / no hay anterior).
 */
export function findStep(steps: TourStep[], from: number, dir: 1 | -1, ctx: TourContext): number {
  for (let i = from; i >= 0 && i < steps.length; i += dir) {
    if (stepAvailable(steps[i], ctx)) return i;
  }
  return -1;
}

/** El paso de espera ya se cumplió (p. ej. se creó el primer hábito). */
export const waitDone = (step: TourStep, ctx: TourContext) => step.waitFor !== "habit" || ctx.hasHabits;

// ---------------------------------------------------------------------------------------------
// Estado: presentación repetida y recorrido en curso
// ---------------------------------------------------------------------------------------------

interface State {
  introReplay: boolean;
  tour: boolean;
}
let state: State = { introReplay: false, tour: false };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const SERVER: State = { introReplay: false, tour: false };

export const useOnboarding = () => useSyncExternalStore(subscribe, () => state, () => SERVER);

/** Ajustes → Ayuda → "Ver la presentación de nuevo": no pide el nombre ni toca datos. */
export const replayIntro = () => set({ introReplay: true });
export const endIntroReplay = () => set({ introReplay: false });

export const startTour = () => set({ tour: true });
export const stopTour = () => set({ tour: false });

/** Solo para tests. */
export const resetOnboarding = () => set({ introReplay: false, tour: false });
