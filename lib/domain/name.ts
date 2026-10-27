import { z } from "zod";
import { NAME_MAX, nameError, normalizeName } from "./name-rules";

// El cliente importa de `name-rules` (sin zod); acá se suma el esquema que usa el servidor.
export { NAME_MAX, nameError, nameLength, normalizeName } from "./name-rules";

/** Esquema compartido: normaliza y valida (1 a 30 caracteres). */
export const nameSchema = z
  .string()
  .max(200)
  .transform(normalizeName)
  .refine((n) => nameError(n) === null, { message: `El nombre tiene que tener entre 1 y ${NAME_MAX} caracteres` });
