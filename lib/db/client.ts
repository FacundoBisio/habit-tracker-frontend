import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __pg: ReturnType<typeof postgres> | undefined;
}

function connection() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL no está definida");
  // Pooler de Supabase en modo transacción: sin prepared statements y 1 conexión por instancia.
  return postgres(url, { prepare: false, max: 1 });
}

export function getDb() {
  globalThis.__pg ??= connection();
  return drizzle(globalThis.__pg, { schema });
}

export type Db = ReturnType<typeof getDb>;
