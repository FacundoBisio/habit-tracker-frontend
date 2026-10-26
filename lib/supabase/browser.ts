"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;
let loading: Promise<SupabaseClient | null> | null = null;

const config = () => ({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

/**
 * Carga diferida del cliente de Supabase: la librería (~70 KB) no entra en el bundle inicial y,
 * si no hay variables configuradas, directamente nunca se descarga. Devuelve `null` si no hay cuenta.
 */
export function loadSupabase(): Promise<SupabaseClient | null> {
  if (client !== undefined) return Promise.resolve(client);
  const { url, key } = config();
  if (!url || !key) {
    client = null;
    return Promise.resolve(null);
  }
  loading ??= import("@supabase/supabase-js").then(({ createClient }) => {
    client = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } });
    return client;
  });
  return loading;
}

/** fetch a nuestra API con el JWT de la sesión. */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const supabase = await loadSupabase();
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const headers = new Headers(init.headers);
  if (data.session) headers.set("authorization", `Bearer ${data.session.access_token}`);
  if (init.body) headers.set("content-type", "application/json");
  return fetch(path, { ...init, headers });
}
