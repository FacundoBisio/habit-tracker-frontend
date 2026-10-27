"use client";

import { motion } from "framer-motion";
import { useEffect, useState, useSyncExternalStore } from "react";
import { preloadMascot } from "@/lib/mascot-engine-state";
import { useSessionFlag } from "@/lib/session-flag";
import { MascotFigure } from "./Mascot";

const GREEN = "#3dd598";
const EASE = [0.32, 0.72, 0, 1] as const;
const HOLD_MS = 1050; // el overlay bloquea solo este tiempo; después se abre y deja pasar los toques

const subscribeMotion = (cb: () => void) => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
const reducedNow = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Splash de arranque, una vez por sesión del navegador: la bola aparece de un salto, el nombre
 * entra letra por letra y un fundido deja ver la app. Se renderiza solo en el cliente
 * (no está en el HTML del servidor, así no afecta al LCP) y se omite con "menos movimiento".
 */
export function LaunchSplash() {
  const [shown, markShown] = useSessionFlag("splash-shown", true);
  const reduced = useSyncExternalStore(subscribeMotion, reducedNow, () => true);
  const [phase, setPhase] = useState<"in" | "out">("in");
  const skip = shown || reduced;

  useEffect(() => {
    if (skip) return;
    void preloadMascot(); // aprovecha el segundo del splash para tener el 3D listo
    const open = setTimeout(() => setPhase("out"), HOLD_MS);
    const failsafe = setTimeout(markShown, 2400); // por si la animación de salida no llega a completarse
    return () => {
      clearTimeout(open);
      clearTimeout(failsafe);
    };
  }, [skip, markShown]);

  if (skip) return null;

  const word = "SuperHábitos";
  return (
    <motion.div
      data-testid="launch-splash"
      aria-hidden
      className={`fixed inset-0 z-[90] grid place-items-center bg-[#090c0a] ${phase === "out" ? "pointer-events-none" : ""}`}
      style={{ backgroundImage: "radial-gradient(60% 40% at 50% 60%, rgba(61,213,152,0.28), transparent)" }}
      initial={{ opacity: 1, scale: 1 }}
      animate={phase === "out" ? { opacity: 0, scale: 1.08 } : { opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: EASE }}
      onAnimationComplete={() => {
        if (phase === "out") markShown();
      }}
    >
      <div className="flex flex-col items-center">
        <motion.div
          initial={{ scale: 0.3, y: 60, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 220, damping: 13 }}
        >
          <MascotFigure activity="celebrate" size={170} interactive={false} />
        </motion.div>
        <div className="font-display -mt-2 flex text-[40px] leading-none font-extrabold tracking-tight">
          {Array.from(word).map((ch, i) => (
            <motion.span
              key={i}
              initial={{ y: 26, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.25 + i * 0.04, duration: 0.45, ease: EASE }}
              style={{ color: i < 5 ? "#fff" : GREEN }}
            >
              {ch}
            </motion.span>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
