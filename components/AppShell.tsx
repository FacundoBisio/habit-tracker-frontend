"use client";

import { AnimatePresence, m } from "framer-motion";
import { CloudOff } from "lucide-react";
import { useEffect } from "react";
import { mascot3dAllowed, preloadMascot } from "@/lib/mascot-engine-state";
import { endIntroReplay, startTour, useOnboarding } from "@/lib/onboarding";
import { useSessionFlag } from "@/lib/session-flag";
import { useAchievementUnlocks } from "@/lib/store/achievements";
import { useTodayProgress } from "@/lib/store/day";
import { useOnline, useSettingsState } from "@/lib/store/hooks";
import { useSync } from "@/lib/sync/use-sync";
import { Aura } from "./Aura";
import { BottomNav } from "./BottomNav";
import { ConfettiLayer } from "./ConfettiLayer";
import dynamic from "next/dynamic";
import { TopBar } from "./TopBar";
import { Welcome } from "./Welcome";

// Cada uno se descarga solo cuando hace falta (el intro es para quien no tiene nombre; el splash, solo para quien sí).
const Intro = dynamic(() => import("./Intro").then((m) => m.Intro), { ssr: false });
const LaunchSplash = dynamic(() => import("./LaunchSplash").then((m) => m.LaunchSplash), { ssr: false });
const Tour = dynamic(() => import("./Tour").then((m) => m.Tour), { ssr: false });

export function AppShell({ children }: { children: React.ReactNode }) {
  const online = useOnline();
  const { status, pending, rejected } = useSync();
  const pct = useTodayProgress();
  const { settings, ready } = useSettingsState();
  // Hasta que el usuario no ponga su nombre se muestra la bienvenida (la app se ve mientras carga).
  const welcome = ready && !settings.name;
  // La presentación con pantallazos va antes de pedir el nombre; un reload en la misma sesión salta directo al nombre.
  const [introDone, markIntroDone] = useSessionFlag("intro-done");
  const [, markSplashShown] = useSessionFlag("splash-shown", true);
  const [tourPending] = useSessionFlag("tour-pending");
  const { introReplay, tour } = useOnboarding();
  useAchievementUnlocks();

  // El 3D se prepara lo antes posible (descarga, parseo y shaders), para que ya esté cuando aparezca el personaje.
  useEffect(() => {
    if (mascot3dAllowed()) void preloadMascot();
  }, []);
  // Quien está en la presentación/bienvenida no necesita además el splash: nunca hay dos personajes a la vez.
  useEffect(() => {
    if (welcome) markSplashShown();
  }, [welcome, markSplashShown]);
  // El recorrido guiado arranca solo una vez, justo después de la bienvenida
  useEffect(() => {
    if (ready && settings.name && tourPending && !settings.tourDoneAt) startTour();
  }, [ready, settings.name, settings.tourDoneAt, tourPending]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <>
      <Aura pct={welcome ? 0 : pct} />
      <AnimatePresence mode="wait" initial={false}>
        {welcome ? (
          introDone ? <Welcome key="welcome" /> : <Intro key="intro" onDone={markIntroDone} />
        ) : (
          <m.div
            key="app"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-[calc(7rem+env(safe-area-inset-bottom))]">
              <TopBar sync={status} pending={pending} rejected={rejected} />
              {!online && (
                <div className="card mb-3 flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-xs text-muted" role="status">
                  <CloudOff className="size-4" /> Sin conexión: tus registros se guardan en este dispositivo
                </div>
              )}
              <main className="flex-1">{children}</main>
            </div>
            <BottomNav />
          </m.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{introReplay && <Intro key="replay" mode="replay" onDone={endIntroReplay} />}</AnimatePresence>
      {tour && !welcome && <Tour />}
      <ConfettiLayer />
      {ready && !!settings.name && <LaunchSplash />}
    </>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[34px] leading-[1.05] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted first-letter:uppercase">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
