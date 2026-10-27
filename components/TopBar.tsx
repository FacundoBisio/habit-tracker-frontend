"use client";

import { AnimatePresence, m } from "framer-motion";
import { AlertCircle, Check, Cloud, CloudOff, Info, Loader2, Moon, Sun, X } from "lucide-react";
import { useEffect, useState } from "react";
import { dismiss, FAST_MS, useNoticeState, type Notice } from "@/lib/notify";
import { applyTheme, effectiveTheme } from "@/lib/theme";
import type { SyncStatus } from "@/lib/sync/engine";
import { cn } from "@/lib/cn";
import { IconChip } from "./HabitIcon";

const SYNC_LABEL: Record<SyncStatus, string> = {
  off: "En este dispositivo",
  syncing: "Sincronizando",
  synced: "Sincronizado",
  pending: "Por sincronizar",
  error: "Sin sincronizar",
};

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const read = () => setTheme(effectiveTheme());
    read();
    window.addEventListener("themechange", read);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", read);
    return () => {
      window.removeEventListener("themechange", read);
      mq.removeEventListener("change", read);
    };
  }, []);

  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      onClick={() => applyTheme(next)}
      aria-label={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className="grid size-11 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <AnimatePresence mode="wait" initial={false}>
        <m.span
          key={theme ?? "none"}
          initial={{ rotate: -60, opacity: 0, scale: 0.7 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          exit={{ rotate: 60, opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.18 }}
        >
          {theme === "dark" ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
        </m.span>
      </AnimatePresence>
    </button>
  );
}

function NoticePill({ n, waiting }: { n: Notice; waiting: number }) {
  const Icon = n.kind === "success" ? Check : n.kind === "error" ? AlertCircle : Info;
  return (
    <m.li
      initial={{ opacity: 0, y: -12, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.97, transition: { duration: 0.14 } }}
      transition={{ type: "spring", stiffness: 520, damping: 34 }}
      className="card relative flex h-12 items-center gap-2.5 overflow-hidden rounded-2xl pr-1 pl-2"
    >
      {n.icon ? (
        <IconChip value={n.icon} size="sm" />
      ) : (
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-xl",
            n.kind === "error" ? "bg-danger/15 text-danger" : "bg-accent text-accent-fg",
          )}
        >
          <Icon className="size-4" strokeWidth={2.4} />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{n.text}</span>
      {waiting > 0 && (
        <span
          className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted"
          aria-label={`${waiting} avisos en espera`}
        >
          +{waiting}
        </span>
      )}
      {n.action && (
        <button
          onClick={() => {
            n.action!.onClick();
            dismiss(n.id);
          }}
          className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-semibold text-accent transition-colors hover:bg-accent-soft"
        >
          {n.action.label}
        </button>
      )}
      <button
        onClick={() => dismiss(n.id)}
        aria-label="Cerrar aviso"
        className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2"
      >
        <X className="size-4" />
      </button>
      <m.span
        className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent/50"
        initial={{ scaleX: 1 }}
        animate={{ scaleX: 0 }}
        transition={{ duration: Math.min(n.duration, waiting > 0 ? FAST_MS : n.duration) / 1000, ease: "linear" }}
      />
    </m.li>
  );
}

/**
 * Franja superior de altura fija (no cambia nunca, así la pantalla no se mueve al registrar).
 * En reposo muestra marca, sincronización y tema; los avisos aparecen acá de a uno, en cola.
 */
export function TopBar({ sync, pending }: { sync: SyncStatus; pending: number }) {
  const { current, waiting } = useNoticeState();
  const SyncIcon = sync === "syncing" ? Loader2 : sync === "off" || sync === "error" ? CloudOff : Cloud;

  return (
    <div className="relative mb-3 h-14">
      <AnimatePresence mode="wait" initial={false}>
        {current ? (
          <m.ul key="notices" role="status" aria-live="polite" className="absolute inset-0 flex items-center">
            <AnimatePresence mode="wait" initial={false}>
              <NoticePill key={current.id} n={current} waiting={waiting} />
            </AnimatePresence>
          </m.ul>
        ) : (
          <m.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            className="absolute inset-0 flex items-center justify-between"
          >
            <span className="font-display flex items-center gap-2 text-[17px] font-semibold tracking-tight">
              <span className="size-2.5 rounded-full bg-accent shadow-[0_0_14px_var(--accent)]" />
              SuperHábitos
            </span>
            <span className="flex items-center gap-1">
              <span className="flex items-center gap-1.5 text-xs text-muted" title={pending ? `${pending} pendientes` : undefined}>
                <SyncIcon className={cn("size-3.5", sync === "syncing" && "animate-spin")} />
                {SYNC_LABEL[sync]}
              </span>
              <ThemeToggle />
            </span>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
