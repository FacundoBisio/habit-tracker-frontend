"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { nameError, normalizeName } from "@/lib/domain/name";
import { saveName } from "@/lib/store/actions";
import { useSessionFlag } from "@/lib/session-flag";
import { MascotFigure } from "./Mascot";
import { inputCls, labelCls, primaryBtn } from "./Sheet";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } } };
const rise = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 260, damping: 26 } } };

/** Primera pantalla: el personaje se presenta y pide tu nombre. Al confirmar pasa a la app. */
export function Welcome() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [, markTourPending] = useSessionFlag("tour-pending");
  const valid = nameError(normalizeName(name)) === null;

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    markTourPending(); // recién terminada la bienvenida: el personaje explica la app
    await saveName(normalizeName(name));
  }

  return (
    <motion.main
      key="welcome"
      className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, transition: { duration: 0.35, ease: [0.32, 0.72, 0, 1] } }}
    >
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-7">
        <div className="flex items-end gap-1">
          <motion.div
            initial={{ scale: 0.4, opacity: 0, rotate: -12 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 240, damping: 14, delay: 0.1 }}
          >
            <MascotFigure activity="wave" size={150} interactive={false} />
          </motion.div>
          <motion.div variants={rise} className="relative min-w-0 flex-1 pb-4">
            <p className="card rounded-[1.4rem] rounded-bl-md px-4 py-3.5">
              <span className="font-display block text-[22px] leading-tight font-semibold tracking-tight">Hola, soy SuperHábitos</span>
            </p>
          </motion.div>
        </div>

        <motion.p variants={rise} className="text-[15px] leading-relaxed text-muted">
          Voy a guiarte para que armes tus hábitos y los cumplas día a día. Registrar cada uno lleva un toque, y yo te
          muestro cómo vas, tus rachas y tus logros.
        </motion.p>

        <motion.form variants={rise} onSubmit={start} className="card space-y-4 rounded-[1.75rem] p-5">
          <div>
            <label className={labelCls} htmlFor="welcome-name">¿Cómo te llamo?</label>
            <input
              id="welcome-name"
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
              autoComplete="given-name"
              maxLength={30}
              autoFocus
            />
          </div>
          <button type="submit" className={primaryBtn} disabled={!valid || busy}>
            Empezar
          </button>
        </motion.form>
      </motion.div>
    </motion.main>
  );
}
