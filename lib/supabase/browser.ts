"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

/** Cliente de Supabase Auth en el navegador; `null` si faltan las variables públicas. */
export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
  return client;
}

/** fetch a nuestra API con el JWT de la sesión. */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const { data } = (await getSupabase()?.auth.getSession()) ?? { data: { session: null } };
  const headers = new Headers(init.headers);
  if (data.session) headers.set("authorization", `Bearer ${data.session.access_token}`);
  if (init.body) headers.set("content-type", "application/json");
  return fetch(path, { ...init, headers });
}
