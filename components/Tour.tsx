"use client";

import { useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useActivityOverride } from "@/lib/mascot";
import { TOUR_STEPS, findStep, stopTour, waitDone, type TourAnchor, type TourContext } from "@/lib/onboarding";
import { saveSettings } from "@/lib/store/actions";
import { useHabitsState } from "@/lib/store/hooks";
import { MascotFigure } from "./Mascot";
import { ghostBtn, primaryBtn } from "./Sheet";

const PAD = 6;
const GAP = 12;
const anchorEl = (a: TourAnchor) => document.querySelector<HTMLElement>(`[data-tour="${a}"]`);
const otherModalOpen = () => !!document.querySelector('[role="dialog"][aria-modal="true"]');

interface View {
  rect: DOMRect | null;
  present: Set<TourAnchor>;
  modal: boolean;
}

/**
 * Recorrido guiado: el personaje explica la app señalando cada parte real de la pantalla. El foco es un recorte
 * con `box-shadow` (barato, sin `clip-path`) y no bloquea los toques: podés usar lo señalado. Mientras hay un popup
 * abierto (p. ej. crear hábito) el recorrido se esconde y vuelve solo al cerrarlo.
 */
export function Tour() {
  const reduced = useReducedMotion() ?? false;
  const { habits } = useHabitsState();
  const hasHabits = habits.length > 0;
  const override = useActivityOverride();
  const onToday = usePathname() === "/"; // el recorrido se hace en Hoy (al repetirlo desde Ajustes se navega primero)
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<View>({ rect: null, present: new Set(), modal: false });
  const next = useRef<HTMLButtonElement>(null);

  const ctx: TourContext = { hasHabits, has: (a) => view.present.has(a) };
  const current = findStep(TOUR_STEPS, index, 1, ctx);
  const step = current >= 0 ? TOUR_STEPS[current] : null;

  const finish = useCallback(() => {
    stopTour();
    void saveSettings({ tourDoneAt: Date.now() });
  }, []);

  // Mide qué anclas hay, dónde está la del paso y si hay otro popup (con cambios del DOM, scroll y tamaño)
  const anchor = step?.anchor;
  useLayoutEffect(() => {
    if (!onToday) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const present = new Set<TourAnchor>();
      for (const s of TOUR_STEPS) if (anchorEl(s.anchor)) present.add(s.anchor);
      const el = anchor ? anchorEl(anchor) : null;
      setView({ rect: el ? el.getBoundingClientRect() : null, present, modal: otherModalOpen() });
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tour", "aria-modal"] });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [anchor, onToday]);

  // Al cambiar de paso, lo señalado se trae a la vista y el foco va a "Siguiente"
  useEffect(() => {
    if (!anchor) return;
    anchorEl(anchor)?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    next.current?.focus({ preventScroll: true });
  }, [anchor, reduced]);

  // El paso de esperar (crear el primer hábito) es solo para quien no tiene hábitos: al crear uno deja de estar
  // disponible y el recorrido sigue solo con el próximo paso.
  const waiting = step ? !waitDone(step, ctx) : false;

  // Se terminaron los pasos disponibles: fin del recorrido (solo cuando ya se midió la pantalla)
  const measured = view.present.size > 0;
  useEffect(() => {
    if (onToday && measured && current === -1) finish();
  }, [onToday, measured, current, finish]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && finish();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish]);

  if (!onToday || !step || !view.rect || view.modal) return null;

  const available: number[] = [];
  for (let i = findStep(TOUR_STEPS, 0, 1, ctx); i !== -1; i = findStep(TOUR_STEPS, i + 1, 1, ctx)) available.push(i);
  const pos = available.indexOf(current) + 1;
  const prev = findStep(TOUR_STEPS, current - 1, -1, ctx);
  const isLast = findStep(TOUR_STEPS, current + 1, 1, ctx) === -1;

  const r = view.rect;
  const vh = window.innerHeight;
  const below = vh - r.bottom > r.top; // la tarjeta va del lado con más lugar: nunca tapa lo señalado
  const move = reduced ? "none" : "all 0.35s cubic-bezier(0.32, 0.72, 0, 1)";

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[75]">
      <div
        aria-hidden
        className="absolute rounded-[1.25rem]"
        style={{
          left: r.left - PAD,
          top: r.top - PAD,
          width: r.width + PAD * 2,
          height: r.height + PAD * 2,
          boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)",
          outline: "2px solid var(--accent)",
          outlineOffset: 2,
          transition: move,
        }}
      />
      <div
        role="dialog"
        aria-label="Recorrido guiado"
        className="pointer-events-auto absolute inset-x-4 mx-auto max-w-sm rounded-[1.5rem] border border-border bg-surface-solid p-4 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.6)]"
        style={below ? { top: r.bottom + PAD + GAP, transition: move } : { bottom: vh - r.top + PAD + GAP, transition: move }}
      >
        <div className="flex items-start gap-2">
          <MascotFigure activity={override ?? step.activity} size={72} interactive={false} />
          <p className="min-w-0 flex-1 pt-2 text-[15px] leading-snug font-medium" aria-live="polite">
            {step.text}
          </p>
        </div>
        {waiting && <p className="mt-1 text-xs text-muted">Cuando lo crees, seguimos.</p>}
        <div className="mt-3 flex items-center gap-2">
          <button className="min-h-11 px-1 text-sm text-muted" onClick={finish}>
            Saltar recorrido
          </button>
          <span className="ml-auto text-xs text-muted tabular-nums" aria-label={`Paso ${pos} de ${available.length}`}>
            {pos}/{available.length}
          </span>
          {prev !== -1 && (
            <button className={ghostBtn} onClick={() => setIndex(prev)}>
              Atrás
            </button>
          )}
          <button
            ref={next}
            className={`${primaryBtn} h-11 w-auto px-5`}
            disabled={waiting}
            onClick={() => (isLast ? finish() : setIndex(findStep(TOUR_STEPS, current + 1, 1, ctx)))}
          >
            {isLast ? "Listo" : "Siguiente"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
