import { createHmac, timingSafeEqual } from "node:crypto";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const b64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/**
 * Verifica localmente (sin red) un access token de Supabase firmado con el secreto HS256 del proyecto
 * y devuelve el id del usuario, o null si la firma, el vencimiento, el rol o el formato no cierran.
 */
export function verifySupabaseJwt(token: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): string | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !secret) return null;
  const [h, p, sig] = parts;
  try {
    const header = JSON.parse(b64url(h).toString("utf8")) as { alg?: string };
    if (header.alg !== "HS256") return null;
    const expected = createHmac("sha256", secret).update(`${h}.${p}`).digest();
    const given = b64url(sig);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const claims = JSON.parse(b64url(p).toString("utf8")) as { sub?: unknown; exp?: unknown; role?: unknown; aud?: unknown };
    if (typeof claims.exp !== "number" || claims.exp <= nowSec) return null;
    if (claims.role !== "authenticated") return null;
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes("authenticated")) return null;
    return typeof claims.sub === "string" && UUID.test(claims.sub) ? claims.sub : null;
  } catch {
    return null;
  }
}
