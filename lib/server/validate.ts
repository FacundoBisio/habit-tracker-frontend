/** Tope razonable para cualquier cantidad (un registro, una meta, un peso). */
export const MAX_AMOUNT = 100_000;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("es-AR", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
