"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CloudOff } from "lucide-react";
import { useEffect } from "react";
import { useAchievementUnlocks } from "@/lib/store/achievements";
import { useDaySummary } from "@/lib/store/day";
import { useOnline, useSettingsState } from "@/lib/store/hooks";
import { useSync } from "@/lib/sync/use-sync";
import { Aura } from "./Aura";
import { BottomNav } from "./BottomNav";
import { ConfettiLayer } from "./ConfettiLayer";
import { TopBar } from "./TopBar";
import { Welcome } from "./Welcome";

export function AppShell({ children }: { children: React.ReactNode }) {
  const online = useOnline();
  const { status, pending } = useSync();
  const { pct } = useDaySummary();
  const { settings, ready } = useSettingsState();
  // Hasta que el usuario no ponga su nombre se muestra la bienvenida (la app se ve mientras carga).
  const welcome = ready && !settings.name;
  useAchievementUnlocks();

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
          <Welcome key="welcome" />
        ) : (
          <motion.div
            key="app"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
          >
            <div className="relative z-10 mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-[calc(7rem+env(safe-area-inset-bottom))]">
              <TopBar sync={status} pending={pending} />
              {!online && (
                <div className="card mb-3 flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-xs text-muted" role="status">
                  <CloudOff className="size-4" /> Sin conexión: tus registros se guardan en este dispositivo
                </div>
              )}
              <main className="flex-1">{children}</main>
            </div>
            <BottomNav />
          </motion.div>
        )}
      </AnimatePresence>
      <ConfettiLayer />
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
