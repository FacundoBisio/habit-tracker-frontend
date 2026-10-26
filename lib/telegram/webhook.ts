import { safeEqual } from "@/lib/server/security";
import type { TelegramUpdate } from "./api";
import { handleUpdate, type BotDeps } from "./handler";

/**
 * Webhook de Telegram: valida el `secret_token` y procesa el update.
 * Siempre responde 200 tras autenticar (si no, Telegram reintenta en bucle); los errores se loguean.
 */
export async function handleWebhook(req: Request, deps: BotDeps, secret: string | undefined) {
  const header = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secret || !safeEqual(header, secret)) return new Response("forbidden", { status: 403 });

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return new Response("bad request", { status: 400 });
  }
  try {
    await handleUpdate(update, deps);
  } catch (err) {
    console.error("[telegram] error procesando update", err instanceof Error ? err.message : err);
  }
  return new Response("ok");
}

/** Cron de recordatorios: `Authorization: Bearer <CRON_SECRET>`. */
export function isCronAuthorized(req: Request, secret: string | undefined) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  return !!secret && !!m && safeEqual(m[1], secret);
}
