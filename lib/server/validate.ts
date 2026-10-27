/** Tope razonable para cualquier cantidad (un registro, una meta, un peso). */
export const MAX_AMOUNT = 100_000;

/**
 * Fecha YYYY-MM-DD que existe en el calendario. Postgres rechaza "2026-02-30" o el año 0000 con un error
 * (y tiraría abajo toda la transacción del push), así que se valida antes.
 */
export function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || s.startsWith("0000")) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("es-AR", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * JSON de afuera sin el carácter NUL (U+0000) en los textos: Postgres no lo acepta en `text` ni en `jsonb`
 * ("invalid byte sequence for encoding UTF8: 0x00") y un solo campo tiraría abajo todo el pedido con un 500.
 */
export function parseJson(text: string): unknown {
  return JSON.parse(text, (_key, value: unknown) => (typeof value === "string" && value.includes("\u0000") ? value.replaceAll("\u0000", "") : value));
}

/** `req.json()` sin NUL; JSON inválido → null. */
export const readJson = (req: Request): Promise<unknown> => req.text().then(parseJson).catch(() => null);

/** Tope de un cuerpo JSON de sincronización. */
export const MAX_BODY_BYTES = 1_000_000;

/**
 * Lee un cuerpo JSON sin pasar de `max` bytes: corta por `content-length` y, si no viene o miente,
 * mientras lee el stream. JSON inválido → `value: null` (lo rechaza la validación).
 */
export async function readJsonBody(req: Request, max: number): Promise<{ tooLarge: true } | { tooLarge: false; value: unknown }> {
  const declared = Number(req.headers.get("content-length"));
  if (declared > max) return { tooLarge: true };
  if (!req.body) return { tooLarge: false, value: null };
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return { tooLarge: true };
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const p of parts) {
    bytes.set(p, offset);
    offset += p.byteLength;
  }
  try {
    return { tooLarge: false, value: parseJson(new TextDecoder().decode(bytes)) };
  } catch {
    return { tooLarge: false, value: null };
  }
}
