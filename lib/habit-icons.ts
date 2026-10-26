/**
 * Íconos de hábito. En el campo `emoji` (nombre histórico) se guarda la *clave* del ícono.
 * En la web se dibuja el ícono (lucide); en textos planos (Telegram, Atajos) se usa `glyph`.
 */
export const HABIT_ICONS = [
  { key: "droplets", label: "Agua", glyph: "💧" },
  { key: "dumbbell", label: "Gimnasio", glyph: "🏋️" },
  { key: "book-open", label: "Lectura", glyph: "📖" },
  { key: "brain", label: "Mente", glyph: "🧠" },
  { key: "footprints", label: "Caminar", glyph: "👟" },
  { key: "bike", label: "Bici", glyph: "🚴" },
  { key: "moon", label: "Dormir", glyph: "🌙" },
  { key: "apple", label: "Comida", glyph: "🍎" },
  { key: "pill", label: "Salud", glyph: "💊" },
  { key: "coffee", label: "Café", glyph: "☕" },
  { key: "heart", label: "Corazón", glyph: "❤️" },
  { key: "pen-line", label: "Escribir", glyph: "✍️" },
  { key: "music", label: "Música", glyph: "🎵" },
  { key: "code", label: "Código", glyph: "💻" },
  { key: "leaf", label: "Naturaleza", glyph: "🌿" },
  { key: "sun", label: "Mañana", glyph: "☀️" },
  { key: "sparkles", label: "Otro", glyph: "✨" },
] as const;

export type HabitIconKey = (typeof HABIT_ICONS)[number]["key"];
export const DEFAULT_ICON: HabitIconKey = "sparkles";

const KEYS = new Set<string>(HABIT_ICONS.map((i) => i.key));

/** Hábitos viejos guardaban un emoji: se mapea al ícono más parecido. */
const LEGACY_EMOJI: Record<string, HabitIconKey> = {
  "💧": "droplets", "🚰": "droplets", "🏋️": "dumbbell", "🏋": "dumbbell", "💪": "dumbbell",
  "📚": "book-open", "📖": "book-open", "🧘": "brain", "🧠": "brain", "🏃": "footprints", "🚶": "footprints",
  "👟": "footprints", "🚴": "bike", "😴": "moon", "🌙": "moon", "🍎": "apple", "🥗": "apple", "💊": "pill",
  "☕": "coffee", "❤️": "heart", "❤": "heart", "✍️": "pen-line", "✍": "pen-line", "🎵": "music", "💻": "code",
  "🌱": "leaf", "🌿": "leaf", "☀️": "sun", "☀": "sun",
};

export function iconKey(value: string | undefined): HabitIconKey {
  if (value && KEYS.has(value)) return value as HabitIconKey;
  return (value && LEGACY_EMOJI[value]) || DEFAULT_ICON;
}

/** Emoji para textos planos (bot de Telegram, respuestas de Atajos). */
export function glyph(value: string | undefined): string {
  const key = iconKey(value);
  return HABIT_ICONS.find((i) => i.key === key)!.glyph;
}
