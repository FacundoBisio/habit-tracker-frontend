import { createClient } from "@supabase/supabase-js";
import { createDrizzleRepo } from "./drizzle-repo";
import type { MeDeps } from "./me-handlers";

/** Valida el JWT de Supabase Auth que manda la PWA y devuelve el id del usuario (o null). */
export async function getSessionUserId(req: Request): Promise<string | null> {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!m || !url || !key) return null;
  const { data, error } = await createClient(url, key, { auth: { persistSession: false } }).auth.getUser(m[1]);
  return error || !data.user ? null : data.user.id;
}

export function getMeDeps(): MeDeps {
  return { repo: createDrizzleRepo(), getUserId: getSessionUserId, now: () => new Date() };
}
