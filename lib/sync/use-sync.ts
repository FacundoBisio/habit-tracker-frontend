"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/store/db";
import { getSupabase } from "@/lib/supabase/browser";
import { syncOnce, type SyncStatus } from "./engine";

const POLL_MS = 60_000;
const DEBOUNCE_MS = 1_500;

/** Sincroniza al abrir, al volver la señal o la app, tras cambios locales y cada minuto (para ver lo del bot/Atajos). */
export function useSync(): { status: SyncStatus; pending: number } {
  const [status, setStatus] = useState<SyncStatus>("off");
  const pending = useLiveQuery(() => db.outbox.count(), [], 0);
  const running = useRef(false);
  const again = useRef(false);

  const run = useCallback(async () => {
    if (!getSupabase()) return;
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
    const supabase = getSupabase();
    if (!supabase) return;
    const kick = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void run();
    };
    kick();
    const { data } = supabase.auth.onAuthStateChange(() => kick());
    const timer = setInterval(kick, POLL_MS);
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", kick);
    return () => {
      data.subscription.unsubscribe();
      clearInterval(timer);
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", kick);
    };
  }, [run]);

  // Cambios locales nuevos → sincronizar con un pequeño debounce.
  useEffect(() => {
    if (!pending || status === "off") return;
    const t = setTimeout(() => void run(), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [pending, status, run]);

  return { status, pending };
}
