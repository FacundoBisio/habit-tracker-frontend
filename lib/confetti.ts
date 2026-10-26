"use client";

import { useSyncExternalStore } from "react";

export const CONFETTI_SHAPES = ["circle", "triangle", "star", "square"] as const;
const COLORS = ["var(--accent)", "var(--fg)", "color-mix(in srgb, var(--accent) 45%, var(--surface-solid))"];

/** Colores de la celebración a pantalla completa (la única excepción a la paleta blanco/negro/verde). */
const PARTY_COLORS = ["#ff4d6d", "#ffb703", "#3dd598", "#4cc9f0", "#9b5de5", "#f15bb5", "#ffffff"];
/** Duración total de la celebración a pantalla completa. */
export const PARTY_MS = 2000;

export interface Particle {
  /** Celebración: posición horizontal inicial (0–1 del ancho) y vaivén lateral al caer. */
  x0?: number;
  sway?: number;
  dx: number;
  dy: number;
  rot: number;
  size: number;
  color: string;
  shape: (typeof CONFETTI_SHAPES)[number];
  delay: number;
}

export interface Burst {
  id: number;
  full?: boolean;
  x: number;
  y: number;
  particles: Particle[];
}

/** Las partículas se generan al disparar (en un evento), no durante el render. */
function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
    const dist = 50 + Math.random() * 90;
    return {
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - 30,
      rot: (Math.random() - 0.5) * 540,
      size: 5 + Math.random() * 5,
      color: COLORS[i % COLORS.length],
      shape: CONFETTI_SHAPES[i % CONFETTI_SHAPES.length],
      delay: Math.random() * 0.05,
    };
  });
}

/** Lluvia de confeti de colores sobre toda la pantalla: cae desde arriba durante `PARTY_MS`. */
function makeParty(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    x0: Math.random(),
    sway: (Math.random() - 0.5) * 120,
    dx: 0,
    dy: 0,
    rot: (Math.random() - 0.5) * 900,
    size: 6 + Math.random() * 6,
    color: PARTY_COLORS[i % PARTY_COLORS.length],
    shape: CONFETTI_SHAPES[i % CONFETTI_SHAPES.length],
    delay: Math.random() * 0.45,
  }));
}

let bursts: Burst[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Lanza confeti desde una posición de pantalla. Se ignora si el usuario pidió menos movimiento. */
export function fireConfetti(x: number, y: number, count = 16) {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const id = ++seq;
  bursts = [...bursts, { id, x, y, particles: makeParticles(count) }];
  emit();
  setTimeout(() => {
    bursts = bursts.filter((b) => b.id !== id);
    emit();
  }, 1600);
}

/** Celebración grande (día completo, logros): confeti de colores por toda la pantalla durante 2 s. */
export function fireParty(count = 140) {
  if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (bursts.some((b) => b.full)) return; // ya hay una celebración en curso (p. ej. día completo + logro a la vez)
  const id = ++seq;
  bursts = [...bursts, { id, full: true, x: 0, y: 0, particles: makeParty(count) }];
  emit();
  setTimeout(() => {
    bursts = bursts.filter((b) => b.id !== id);
    emit();
  }, PARTY_MS + 100);
}

/** Confeti desde el centro de un elemento. */
export function confettiFrom(el: Element | null, count?: number) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  fireConfetti(r.left + r.width / 2, r.top + r.height / 2, count);
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const EMPTY: Burst[] = [];

export const useBursts = () => useSyncExternalStore(subscribe, () => bursts, () => EMPTY);
