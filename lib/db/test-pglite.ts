import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";

const DRIZZLE_DIR = join(__dirname, "../../drizzle");

/**
 * Postgres real en memoria (PGlite, WASM) con las migraciones de `drizzle/` aplicadas en orden, para tests.
 * Antes se crean los roles de la API pública como en Supabase (con permisos por defecto sobre `public`),
 * así la migración de RLS ejecuta su rama REVOKE igual que en producción.
 */
export async function createTestDb() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
  `);
  const journal = JSON.parse(readFileSync(join(DRIZZLE_DIR, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    const file = readFileSync(join(DRIZZLE_DIR, `${tag}.sql`), "utf8");
    for (const statement of file.split("--> statement-breakpoint")) {
      if (statement.trim()) await pg.exec(statement);
    }
  }
  const db = drizzle(pg, { schema });
  /** Vacía todas las tablas (más rápido que crear otra base por test). */
  const reset = () => pg.exec(`TRUNCATE ${schema.RLS_TABLES.map((name) => `"${name}"`).join(", ")} CASCADE`);
  return { pg, db, reset, close: () => pg.close() };
}
