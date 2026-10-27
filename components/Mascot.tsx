"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { ACTIVITY_LABEL, useActivityOverride, type Activity } from "@/lib/mascot";
import { useMascotKind } from "@/lib/mascot-3d";
import { MASCOT_TIMEOUT_MS, isMascotReady, useMascotStatus } from "@/lib/mascot-engine-state";

/**
 * Bola verde con cara: es lo que se ve mientras carga la esfera 3D, y lo único que se ve si el
 * dispositivo no tiene WebGL 2, el usuario pidió "menos movimiento" o el modelo no carga.
 * Mismo tamaño de caja que el 3D, así no hay saltos de layout.
 */
function BallFigure({ activity, size }: { activity: Activity; size: number }) {
  const reduce = useReducedMotion();
  const sleeping = activity === "sleep" || activity === "meditate";
  return (
    <motion.div
      role="img"
      aria-label={ACTIVITY_LABEL[activity]}
      className="shrink-0"
      style={{ width: size, height: size * 0.875 }}
      animate={reduce ? undefined : { y: [0, -3, 0], scaleY: [1, 1.025, 1] }}
      transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
    >
      <svg width={size} height={size * 0.875} viewBox="0 0 160 140" aria-hidden>
        <defs>
          <radialGradient id="ball-body" cx="0.36" cy="0.3" r="0.8">
            <stop offset="0%" stopColor="#7fe3b8" />
            <stop offset="55%" stopColor="#1fa971" />
            <stop offset="100%" stopColor="#0f6b45" />
          </radialGradient>
        </defs>
        <ellipse cx="80" cy="131" rx="44" ry="5" fill="var(--fg)" opacity="0.14" />
        <circle cx="80" cy="70" r="60" fill="url(#ball-body)" />
        <ellipse cx="56" cy="36" rx="17" ry="9" fill="#fff" opacity="0.5" transform="rotate(-28 56 36)" />
        <g fill="#fff">
          <ellipse cx="63" cy="68" rx="10" ry="12" />
          <ellipse cx="97" cy="68" rx="10" ry="12" />
        </g>
        {sleeping ? (
          <g stroke="#0a0f0c" strokeWidth="3" strokeLinecap="round" fill="none">
            <path d="M54 68q9 6 18 0" />
            <path d="M88 68q9 6 18 0" />
          </g>
        ) : (
          <g fill="#0a0f0c">
            <circle cx="64" cy="70" r="5.6" />
            <circle cx="96" cy="70" r="5.6" />
          </g>
        )}
        <g fill="#fff" opacity="0.3">
          <circle cx="44" cy="88" r="6" />
          <circle cx="116" cy="88" r="6" />
        </g>
        <path d="M70 90q10 8 20 0" stroke="#0a0f0c" strokeWidth="3.2" strokeLinecap="round" fill="none" />
      </svg>
    </motion.div>
  );
}

// three.js y el modelo se descargan solo si se usa el 3D (el módulo entero es de carga diferida).
const Mascot3D = dynamic(() => import("./Mascot3D"), { ssr: false });

/**
 * Personaje del usuario: la esfera 3D si el dispositivo tiene WebGL 2, el usuario no pidió "menos
 * movimiento" y eligió 3D; si no, la bola verde. Con el 3D se reserva la caja vacía mientras carga (nunca se
 * muestra la bola de pasada); la bola aparece solo si el 3D falla, se pierde el contexto o tarda más de
 * `MASCOT_TIMEOUT_MS` (en ese caso se queda así en esa pantalla, sin fundido tardío).
 */
export function MascotFigure({ activity, size = 128, interactive = true }: { activity: Activity; size?: number; interactive?: boolean }) {
  const kind = useMascotKind();
  const status = useMascotStatus();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (kind !== "3d") return;
    const id = setTimeout(() => {
      if (!isMascotReady()) setTimedOut(true);
    }, MASCOT_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [kind]);

  const box = { width: size, height: size * 0.875 };
  if (kind === "pending") return <div className="shrink-0" style={box} aria-hidden />;
  if (kind === "ball" || timedOut || status === "failed" || status === "lost") return <BallFigure activity={activity} size={size} />;

  return (
    <div className="relative shrink-0" style={box}>
      <Mascot3D activity={activity} size={size} interactive={interactive} />
    </div>
  );
}

export function Mascot({ message }: { message: string }) {
  // Lo último que se tocó manda durante 10 s; después vuelve al estado por defecto.
  const override = useActivityOverride();
  const activity: Activity = override ?? "idle";

  return (
    <div className="mb-5 flex items-end gap-1">
      <MascotFigure activity={activity} size={140} />
      <div className="relative min-w-0 flex-1 pb-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={message}
            initial={{ opacity: 0, scale: 0.94, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.1 } }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className="card relative origin-bottom-left rounded-[1.25rem] rounded-bl-md px-4 py-3 text-[14px] leading-snug font-medium"
          >
            {message}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
