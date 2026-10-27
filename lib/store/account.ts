"use client";

import { apiFetch, loadSupabase } from "@/lib/supabase/browser";
import { stopSync } from "@/lib/sync/engine";
import { db } from "./db";

/** ¿Hay una sesión de cuenta abierta en este dispositivo? */
export async function hasSession(): Promise<boolean> {
  const supabase = await loadSupabase();
  return !!(await supabase?.auth.getSession())?.data.session;
}

/**
 * Borra todo lo de este dispositivo y vuelve a empezar como recién instalada (presentación → bienvenida):
 * IndexedDB, localStorage, sessionStorage, caché del service worker y la sesión.
 */
export async function wipeLocal() {
  stopSync(); // primero: que la cola no vuelva a empujar datos al servidor
  const supabase = await loadSupabase();
  await supabase?.auth.signOut().catch(() => {});
  db.close();
  await db.delete();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* almacenamiento bloqueado: no hay nada que limpiar */
  }
  if ("caches" in window) {
    for (const k of await caches.keys()) await caches.delete(k);
  }
  location.replace("/");
}

export type DeleteResult = { ok: true } | { ok: false; error: string; retry?: boolean };

/**
 * Elimina la cuenta en el servidor y, solo si eso salió bien, borra lo local. Si el servidor falla no se toca nada
 * del dispositivo (no puede quedar la cuenta viva con los datos locales borrados).
 */
export async function deleteAccount(): Promise<DeleteResult> {
  if (!(await hasSession())) {
    await wipeLocal();
    return { ok: true };
  }
  try {
    const res = await apiFetch("/api/me", { method: "DELETE", body: JSON.stringify({ confirm: "ELIMINAR" }) });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; retry?: boolean };
      return { ok: false, error: body.error ?? "No se pudo eliminar la cuenta", retry: body.retry ?? true };
    }
  } catch {
    return { ok: false, error: "Sin conexión con el servidor", retry: true };
  }
  await wipeLocal();
  return { ok: true };
}
