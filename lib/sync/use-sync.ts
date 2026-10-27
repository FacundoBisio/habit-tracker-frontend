"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/store/db";
import { loadSupabase } from "@/lib/supabase/browser";
import { syncOnce, type SyncStatus } from "./engine";
import { summarizeOutbox } from "./plan";

const EMPTY = { pending: 0, rejected: [] as string[] };

const POLL_MS = 60_000;
const DEBOUNCE_MS = 1_500;

/**
 * Sincroniza al abrir, al volver la señal o la app, tras cambios locales y cada minuto (para ver lo del bot/Atajos).
 * `rejected`: registros que el servidor no aceptó (siguen en el dispositivo y se reintentan en cada sincronización).
 */
export function useSync(): { status: SyncStatus; pending: number; rejected: number } {
  const [status, setStatus] = useState<SyncStatus>("off");
  // Lo rechazado no cuenta como pendiente: si contara, el debounce de abajo sincronizaría en bucle.
  const outbox = useLiveQuery(
    async () => {
      const [total, rejected] = await Promise.all([db.outbox.count(), db.outbox.where("rejected").above("").toArray()]);
      return { pending: total - rejected.length, rejected: summarizeOutbox(rejected).rejected };
    },
    [],
    EMPTY,
  );
  const pending = outbox.pending;
  const rejected = outbox.rejected.length;
  const running = useRef(false);
  const again = useRef(false);

  const run = useCallback(async () => {
    if (!(await loadSupabase())) return;
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setStatus((s) => (s === "off" ? s : "syncing"));
    try {
      do {
        again.current = false;
        setStatus(await syncOnce());
      } while (again.current);
    } catch {
      setStatus("error");
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    // El cliente de Supabase se carga aparte; sin cuenta configurada no se descarga nunca.
    loadSupabase().then((supabase) => {
      if (!supabase || cancelled) return;
      const kick = () => {
        if (document.visibilityState === "visible" && navigator.onLine) void run();
      };
      kick();
      const { data } = supabase.auth.onAuthStateChange(() => kick());
      const timer = setInterval(kick, POLL_MS);
      window.addEventListener("online", kick);
      document.addEventListener("visibilitychange", kick);
      cleanup = () => {
        data.subscription.unsubscribe();
        clearInterval(timer);
        window.removeEventListener("online", kick);
        document.removeEventListener("visibilitychange", kick);
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [run]);

  // Cambios locales nuevos → sincronizar con un pequeño debounce.
  useEffect(() => {
    if (!pending || status === "off") return;
    const t = setTimeout(() => void run(), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [pending, status, run]);

  return { status, pending, rejected };
}
