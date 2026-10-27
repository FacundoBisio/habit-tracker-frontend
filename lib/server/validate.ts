/** Tope razonable para cualquier cantidad (un registro, una meta, un peso). */
export const MAX_AMOUNT = 100_000;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("es-AR", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

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
    return { tooLarge: false, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { tooLarge: false, value: null };
  }
}
