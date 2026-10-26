export interface Matchable {
  id: string;
  name: string;
  aliases: string[];
}

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export type MatchResult<T> =
  | { type: "match"; habit: T }
  | { type: "ambiguous"; candidates: T[] }
  | { type: "none" };

/**
 * Resuelve un texto libre (id, nombre o alias) a un hábito.
 * Prioridad: id exacto → nombre/alias exacto → nombre/alias que contiene al texto o viceversa.
 */
export function resolveHabit<T extends Matchable>(habits: T[], query: string): MatchResult<T> {
  const byId = habits.find((h) => h.id === query);
  if (byId) return { type: "match", habit: byId };

  const q = normalize(query);
  if (!q) return { type: "none" };
  const labels = (h: T) => [h.name, ...h.aliases].map(normalize).filter(Boolean);

  const exact = habits.filter((h) => labels(h).includes(q));
  if (exact.length === 1) return { type: "match", habit: exact[0] };
  if (exact.length > 1) return { type: "ambiguous", candidates: exact };

  const loose = habits.filter((h) => labels(h).some((l) => l.includes(q) || (l.length >= 3 && q.includes(l))));
  if (loose.length === 1) return { type: "match", habit: loose[0] };
  if (loose.length > 1) return { type: "ambiguous", candidates: loose };
  return { type: "none" };
}
