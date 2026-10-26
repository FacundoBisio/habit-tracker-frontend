import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export function haptic(ms = 10) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* iOS Safari no soporta vibración */
  }
}

/** Formatea 1.5 → "1,5" y 2 → "2" (es-AR). */
export const fmt = (n: number) => new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(n);

/** Color de la llama de una racha: neutra hasta 9, naranja desde 10 y roja desde 30 (excepción a la paleta). */
export const streakColor = (n: number): string | undefined =>
  n >= 30 ? "var(--flame-red)" : n >= 10 ? "var(--flame-orange)" : undefined;

/** "1 vasos" → "1 vaso": singulariza unidades terminadas en "s" cuando la cantidad es 1. */
export const unitLabel = (n: number, unit?: string) =>
  !unit ? "" : Math.abs(n) === 1 && unit.length > 3 && unit.endsWith("s") ? unit.slice(0, -1) : unit;
