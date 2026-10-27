import { z } from "zod";

export const NAME_MAX = 30;

/**
 * Normaliza el nombre con el que te llama la app: NFC, sin caracteres de control ni invisibles (zero-width,
 * BOM, marcas de dirección), espacios colapsados y recortado. Se usa igual en el cliente y en el servidor.
 */
export function normalizeName(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cantidad de caracteres "visibles" (un emoji compuesto cuenta como uno). */
export function nameLength(name: string): number {
  return Array.from(new Intl.Segmenter("es", { granularity: "grapheme" }).segment(name)).length;
}

/** Devuelve el error para mostrar, o null si el nombre (ya normalizado) es válido. */
export function nameError(name: string): string | null {
  const n = nameLength(name);
  if (n === 0) return "Escribí cómo querés que te llame";
  if (n > NAME_MAX) return `Máximo ${NAME_MAX} caracteres`;
  return null;
}

/** Esquema compartido: normaliza y valida (1 a 30 caracteres). */
export const nameSchema = z
  .string()
  .max(200)
  .transform(normalizeName)
  .refine((n) => nameError(n) === null, { message: `El nombre tiene que tener entre 1 y ${NAME_MAX} caracteres` });
