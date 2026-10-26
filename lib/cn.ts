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
