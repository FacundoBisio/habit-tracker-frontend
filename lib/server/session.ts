import { createClient } from "@supabase/supabase-js";
import { createTelegramClient } from "@/lib/telegram/api";
import { createDrizzleRepo } from "./drizzle-repo";
import type { MeDeps } from "./me-handlers";
import { verifySupabaseJwt } from "./jwt";
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

declare global {
  var __authClient: ReturnType<typeof createClient> | undefined;
}

function authClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  // Reusado entre requests de la misma instancia (cachea las claves públicas para getClaims).
  globalThis.__authClient ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return globalThis.__authClient;
}

const bearer = (req: Request) => /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? null;

/**
 * Valida el JWT de Supabase Auth que manda la PWA y devuelve el id del usuario (o null).
 * Sin red: con el secreto HS256 del proyecto se verifica acá mismo. Si el proyecto pasa a claves
 * asimétricas, `getClaims()` lo verifica con las claves públicas cacheadas.
 */
export async function getSessionUserId(req: Request): Promise<string | null> {
  const jwt = bearer(req);
  if (!jwt) return null;
  const secret = process.env.SUPABASE_JWT_SECRET;
  const local = secret ? verifySupabaseJwt(jwt, secret) : null;
  if (local) return local;
  const client = authClient();
  if (!client) return null;
  const { data, error } = await client.auth.getClaims(jwt);
  const sub = data?.claims?.sub;
  return error || typeof sub !== "string" ? null : sub;
}

/** Para operaciones sensibles (eliminar la cuenta): pregunta a Supabase Auth que el usuario siga existiendo y la sesión sea válida. */
export async function getVerifiedUserId(req: Request): Promise<string | null> {
  const jwt = bearer(req);
  const client = authClient();
  if (!jwt || !client) return null;
  const { data, error } = await client.auth.getUser(jwt);
  return error || !data.user ? null : data.user.id;
}

export function getMeDeps(): MeDeps {
  globalThis.__deleteLimiter ??= createRateLimiter(5, 60 * 60_000);
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  return {
    repo: createDrizzleRepo(),
    getUserId: getSessionUserId,
    getVerifiedUserId,
    now: () => new Date(),
    deleteAuthUser,
    sendTelegram: botToken ? (chatId, text) => createTelegramClient(botToken).sendMessage(chatId, text).then(() => {}) : undefined,
    deleteLimiter: globalThis.__deleteLimiter,
  };
}
