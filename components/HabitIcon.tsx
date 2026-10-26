import {
  Apple,
  BookOpen,
  Bike,
  Brain,
  Code,
  Coffee,
  Droplets,
  Dumbbell,
  Footprints,
  Heart,
  Leaf,
  type LucideIcon,
  Moon,
  Music,
  PenLine,
  Pill,
  Sparkles,
  Sun,
} from "lucide-react";
import { iconKey, type HabitIconKey } from "@/lib/habit-icons";

const MAP: Record<HabitIconKey, LucideIcon> = {
  droplets: Droplets,
  dumbbell: Dumbbell,
  "book-open": BookOpen,
  brain: Brain,
  footprints: Footprints,
  bike: Bike,
  moon: Moon,
  apple: Apple,
  pill: Pill,
  coffee: Coffee,
  heart: Heart,
  "pen-line": PenLine,
  music: Music,
  code: Code,
  leaf: Leaf,
  sun: Sun,
  sparkles: Sparkles,
};

/** Dibuja el ícono de un hábito a partir del valor guardado (clave o emoji viejo). */
export function HabitIcon({ value, className }: { value: string | undefined; className?: string }) {
  const Icon = MAP[iconKey(value)];
  return <Icon className={className} strokeWidth={1.9} aria-hidden />;
}

/**
 * Tarjeta de ícono: fondo verde y glifo blanco (modo claro) o negro (modo oscuro), con sombra.
 * `on` agrega un halo (señal de "hecho").
 */
export function IconChip({ value, size = "md", on = false }: { value: string | undefined; size?: "sm" | "md" | "lg"; on?: boolean }) {
  const box = size === "lg" ? "size-16 rounded-3xl" : size === "sm" ? "size-9 rounded-xl" : "size-12 rounded-2xl";
  const icon = size === "lg" ? "size-8" : size === "sm" ? "size-[18px]" : "size-6";
  return (
    <span data-on={on} className={`chip grid shrink-0 place-items-center ${box}`}>
      <HabitIcon value={value} className={icon} />
    </span>
  );
}
