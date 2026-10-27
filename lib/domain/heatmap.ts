import { addDays, startOfWeek } from "./dates";
import type { LocalDate, WeekStart } from "./types";

export interface HeatmapRange {
  /** Primer día que se pinta (1.º del mes en que empezaste a usar la app). */
  from: LocalDate;
  /** Inicio de cada columna (semana), de la más vieja a la actual. */
  weeks: LocalDate[];
}

const monthStart = (date: LocalDate): LocalDate => `${date.slice(0, 7)}-01`;

/**
 * Rango del mapa de calor: desde el mes del primer registro hasta hoy, con tope de ~1 año
 * (si usás la app hace más, arranca 12 meses atrás). Sin registros, arranca este mes.
 */
export function heatmapRange(firstDate: LocalDate | undefined, today: LocalDate, weekStartsOn: WeekStart): HeatmapRange {
  const oldest = monthStart(addDays(today, -364));
  const first = firstDate && firstDate <= today ? monthStart(firstDate) : monthStart(today);
  const from = first > oldest ? first : oldest;
  const weeks: LocalDate[] = [];
  for (let w = startOfWeek(from, weekStartsOn); w <= today; w = addDays(w, 7)) weeks.push(w);
  return { from, weeks };
}

/** Primer día de mes que cae dentro de la semana (para poner el nombre del mes arriba de la columna). */
export function monthStartingIn(weekStart: LocalDate, from: LocalDate): LocalDate | undefined {
  for (let d = 0; d < 7; d++) {
    const date = addDays(weekStart, d);
    if (date >= from && date.endsWith("-01")) return date;
  }
  return undefined;
}
