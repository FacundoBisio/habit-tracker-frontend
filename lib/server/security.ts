import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** El token en claro se muestra una sola vez; en la DB solo queda el hash. */
export function generateToken() {
  const token = `ht_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashToken(token) };
}

/** Código corto para vincular Telegram (sin caracteres ambiguos). */
export function generateLinkCode(length = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** UUID determinístico (formato v5-like) para derivar `client_id` estables por ítem y reintento. */
export function deterministicUuid(seed: string) {
  const h = createHash("sha1").update(seed).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Rate limit en memoria por clave (ventana fija). En serverless cada instancia tiene su propio
 * contador, así que es un freno best-effort contra ráfagas, no una garantía global.
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (key: string, now = Date.now()) => {
    const cur = hits.get(key);
    if (!cur || cur.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true as const };
    }
    cur.count++;
    return cur.count > limit
      ? { ok: false as const, retryAfterSec: Math.ceil((cur.resetAt - now) / 1000) }
      : { ok: true as const };
  };
}
