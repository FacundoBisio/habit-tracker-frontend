"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Flame, Target, Trophy } from "lucide-react";
import { useState } from "react";
import type { Activity } from "@/lib/mascot";
import { MascotFigure } from "./Mascot";

const EASE = [0.32, 0.72, 0, 1] as const;
// El intro es siempre oscuro (blanco, negro y verde), sin importar el tema de la app.
const GREEN = "#3dd598";
const SLIDES = 2;

/** Una línea del título: sube desde atrás de una máscara (overflow hidden). */
function Line({ children, delay, green = false, reduced }: { children: string; delay: number; green?: boolean; reduced: boolean }) {
  return (
    <span className="block overflow-hidden pt-[0.1em] pb-[0.04em]" aria-hidden>
      <motion.span
        className="font-display block leading-[1.02] font-extrabold tracking-tight"
        style={{ color: green ? GREEN : "#fff" }}
        initial={reduced ? { opacity: 0 } : { y: "110%" }}
        animate={reduced ? { opacity: 1 } : { y: 0 }}
        transition={{ delay: reduced ? 0 : delay, duration: reduced ? 0.2 : 0.7, ease: EASE }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/** El slime asoma desde el borde inferior (recortado por abajo) y sube con un resorte. */
function Peek({ activity, reduced }: { activity: Activity; reduced: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-[130px] justify-center overflow-hidden">
      <motion.div
        style={{ marginTop: -62 }}
        initial={reduced ? { opacity: 0 } : { y: 160 }}
        animate={reduced ? { opacity: 1 } : { y: 0 }}
        transition={{ type: "spring", stiffness: 130, damping: 15, delay: reduced ? 0 : 0.55 }}
      >
        <MascotFigure activity={activity} size={230} interactive={false} />
      </motion.div>
    </div>
  );
}

function SlideOne({ reduced }: { reduced: boolean }) {
  return (
    <>
      <div className="mx-auto w-full max-w-md px-6 pt-[calc(5rem+env(safe-area-inset-top))]">
        <h1 aria-label="Hacé hábitos mejores con SuperHábitos" style={{ fontSize: "clamp(38px, 11.5vw, 47px)" }}>
          <Line delay={0.35} reduced={reduced}>HACÉ</Line>
          <Line delay={0.44} reduced={reduced}>HÁBITOS</Line>
          <Line delay={0.53} green reduced={reduced}>MEJORES</Line>
          <motion.svg viewBox="0 0 120 10" className="mt-1 mb-1 h-3 w-44" aria-hidden>
            <motion.path
              d="M2 5 Q12 -1 22 5 T42 5 T62 5 T82 5 T102 5 T118 5"
              fill="none"
              stroke={GREEN}
              strokeWidth="4"
              strokeLinecap="round"
              initial={{ pathLength: reduced ? 1 : 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: reduced ? 0 : 1.1, duration: reduced ? 0 : 0.7, ease: EASE }}
            />
          </motion.svg>
          <Line delay={0.62} reduced={reduced}>CON</Line>
          <Line delay={0.71} reduced={reduced}>SUPERHÁBITOS</Line>
        </h1>
      </div>
      <Peek activity="wave" reduced={reduced} />
    </>
  );
}

const CHIPS = [
  { icon: Flame, title: "Un toque", sub: "Registrar lleva un segundo" },
  { icon: Target, title: "Una racha", sub: "Tu constancia se ve crecer" },
  { icon: Trophy, title: "Un logro", sub: "Cada hito se celebra" },
] as const;

function SlideTwo({ reduced }: { reduced: boolean }) {
  return (
    <>
      <div className="mx-auto w-full max-w-md px-6 pt-[calc(5rem+env(safe-area-inset-top))]">
        <h1 aria-label="Un toque. Una racha. Un logro." style={{ fontSize: "clamp(38px, 11.5vw, 47px)" }}>
          <Line delay={0.3} reduced={reduced}>UN TOQUE.</Line>
          <Line delay={0.4} reduced={reduced}>UNA RACHA.</Line>
          <Line delay={0.5} green reduced={reduced}>UN LOGRO.</Line>
        </h1>
        <ul className="mt-6 grid grid-cols-3 gap-2.5">
          {CHIPS.map(({ icon: Icon, title, sub }, i) => (
            <motion.li
              key={title}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduced ? 0 : 0.75 + i * 0.12, type: "spring", stiffness: 240, damping: 22 }}
              className="rounded-2xl border border-white/10 bg-white/[0.07] p-3"
            >
              <span className="mb-2 grid size-9 place-items-center rounded-xl" style={{ background: GREEN, color: "#04140c" }}>
                <Icon className="size-5" strokeWidth={2.2} aria-hidden />
              </span>
              <span className="block text-[13px] font-semibold">{title}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-white/60">{sub}</span>
            </motion.li>
          ))}
        </ul>
      </div>
      <Peek activity="lift" reduced={reduced} />
    </>
  );
}

/**
 * Entrada con pantallazos a pantalla completa: tipografía enorme, el slime asomando desde abajo y
 * un revelado circular entre pantallas. Siempre oscuro. Con "menos movimiento" solo hay fundidos.
 */
export function Intro({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion() ?? false;
  const [index, setIndex] = useState(0);
  const last = index === SLIDES - 1;
  const go = (n: number) => setIndex(Math.max(0, Math.min(SLIDES - 1, n)));

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Presentación de SuperHábitos"
      className="fixed inset-0 z-[80] touch-pan-y overflow-hidden bg-[#090c0a] text-white"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35 } }}
      onPanEnd={(_, info) => {
        if (info.offset.x < -60) go(index + 1);
        else if (info.offset.x > 60) go(index - 1);
      }}
    >
      <AnimatePresence>
        <motion.section
          key={index}
          className="absolute inset-0 bg-[#090c0a]"
          style={{
            backgroundImage:
              "radial-gradient(70% 45% at 50% 100%, rgba(61,213,152,0.30), transparent), radial-gradient(60% 35% at 0% 0%, rgba(61,213,152,0.10), transparent)",
          }}
          initial={reduced ? { opacity: 0 } : { clipPath: "circle(0% at 50% 92%)" }}
          animate={reduced ? { opacity: 1 } : { clipPath: "circle(150% at 50% 92%)" }}
          exit={{ opacity: 1, transition: { duration: reduced ? 0.2 : 0.7 } }}
          transition={{ duration: reduced ? 0.2 : 0.7, ease: EASE }}
        >
          {index === 0 ? <SlideOne reduced={reduced} /> : <SlideTwo reduced={reduced} />}
        </motion.section>
      </AnimatePresence>

      {/* Controles: sobre las pantallas, por encima del slime */}
      <button
        onClick={onDone}
        style={{ right: "max(0.75rem, calc(50vw - 14rem))" }}
        className="absolute top-[calc(0.75rem+env(safe-area-inset-top))] z-20 min-h-11 rounded-full px-4 text-sm font-medium text-white/80 transition-colors hover:bg-white/10"
      >
        Saltar
      </button>
      <div className="absolute bottom-[150px] left-1/2 z-20 flex w-full max-w-md -translate-x-1/2 items-center justify-between px-6">
        <div className="flex items-center gap-1.5" aria-hidden>
          {Array.from({ length: SLIDES }, (_, i) => (
            <motion.span
              key={i}
              className="h-2 rounded-full"
              animate={{ width: i === index ? 26 : 8, backgroundColor: i === index ? GREEN : "rgba(255,255,255,0.3)" }}
              transition={{ duration: 0.4, ease: EASE }}
            />
          ))}
        </div>
        <button
          onClick={() => (last ? onDone() : go(index + 1))}
          className="min-h-12 rounded-full px-7 text-[15px] font-semibold shadow-[0_10px_28px_-10px_rgba(61,213,152,0.9)] transition active:scale-95"
          style={{ background: GREEN, color: "#04140c" }}
        >
          {last ? "Empezar" : "Siguiente"}
        </button>
      </div>
    </motion.div>
  );
}
