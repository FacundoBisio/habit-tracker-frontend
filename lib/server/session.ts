import { createClient } from "@supabase/supabase-js";
import { createTelegramClient } from "@/lib/telegram/api";
import { createDrizzleRepo } from "./drizzle-repo";
import type { MeDeps } from "./me-handlers";
import { createRateLimiter } from "./security";

declare global {
  var __deleteLimiter: ReturnType<typeof createRateLimiter> | undefined;
}

/** Borra el usuario de Supabase Auth. Necesita `SUPABASE_SERVICE_ROLE_KEY` (solo servidor, nunca NEXT_PUBLIC_). */
async function deleteAuthUser(userId: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY");
  const { error } = await createClient(url, serviceKey, { auth: { persistSession: false } }).auth.admin.deleteUser(userId);
  if (error) throw error;
}

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
  globalThis.__deleteLimiter ??= createRateLimiter(5, 60 * 60_000);
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  return {
    repo: createDrizzleRepo(),
    getUserId: getSessionUserId,
    now: () => new Date(),
    deleteAuthUser,
    sendTelegram: botToken ? (chatId, text) => createTelegramClient(botToken).sendMessage(chatId, text).then(() => {}) : undefined,
    deleteLimiter: globalThis.__deleteLimiter,
  };
}
