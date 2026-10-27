import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableName, isTable, type Table } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "./schema";
import { createTestDb } from "./test-pglite";

const migrations = readdirSync(join(__dirname, "../../drizzle"))
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(__dirname, "../../drizzle", f), "utf8"))
  .join("\n");

const tables = (Object.values(schema) as unknown[]).filter((v): v is Table => isTable(v)).map((t) => getTableName(t));

describe("RLS en las migraciones", () => {
  it("toda tabla del esquema tiene RLS activada en alguna migración", () => {
    expect(tables.length).toBeGreaterThan(0);
    const missing = tables.filter((name) => !new RegExp(`ALTER TABLE "${name}" ENABLE ROW LEVEL SECURITY`, "i").test(migrations));
    expect(missing).toEqual([]);
  });

  it("no quedan políticas que abran tablas a usuarios de la API pública", () => {
    expect(migrations).not.toMatch(/CREATE POLICY/i);
    expect(migrations).toMatch(/REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated/);
  });

  it("RLS_TABLES coincide con las tablas reales", () => {
    expect([...schema.RLS_TABLES].sort()).toEqual([...tables].sort());
  });
});

describe("RLS en un Postgres real (PGlite con las migraciones)", () => {
  const db = createTestDb();
  afterAll(async () => (await db).close());
  beforeAll(async () => {
    await db;
  }, 60_000);

  /** Corre `sql` con el rol dado dentro de una transacción que siempre se deshace. */
  async function asRole(role: string, sql: string, setup = "") {
    const { pg } = await db;
    let result: { rows: unknown[] } | undefined;
    await pg
      .transaction(async (tx) => {
        if (setup) await tx.exec(setup);
        await tx.exec(`SET LOCAL ROLE ${role}`);
        result = await tx.query(sql);
        throw new Error("rollback");
      })
      .catch((err: Error) => {
        if (err.message !== "rollback") throw err;
      });
    return result!;
  }

  it("toda tabla de public tiene RLS activada", async () => {
    const { pg } = await db;
    const { rows } = await pg.query<{ relname: string; relrowsecurity: boolean }>(
      `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')`,
    );
    expect(rows.map((r) => r.relname).sort()).toEqual([...schema.RLS_TABLES].sort());
    expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);
  });

  it.each(["anon", "authenticated"])("%s no puede leer ni escribir ninguna tabla (permission denied)", async (role) => {
    for (const table of schema.RLS_TABLES) {
      await expect(asRole(role, `SELECT * FROM "${table}"`)).rejects.toThrow(/permission denied/);
      await expect(asRole(role, `DELETE FROM "${table}"`)).rejects.toThrow(/permission denied/);
    }
    await expect(
      asRole(role, `INSERT INTO "habits" ("user_id", "name") VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'x')`),
    ).rejects.toThrow(/permission denied/);
  });

  it("los permisos por defecto de Supabase quedaron revocados: una tabla nueva tampoco es accesible", async () => {
    await expect(asRole("anon", `SELECT * FROM "tabla_nueva"`, `CREATE TABLE "tabla_nueva" (id int)`)).rejects.toThrow(/permission denied/);
  });

  it("aunque alguien vuelva a dar permisos, la RLS sin políticas no deja ver filas", async () => {
    const setup = `
      INSERT INTO "habits" ("user_id", "name") VALUES ('aaaaaaaa-0000-4000-8000-000000000001', 'Agua');
      GRANT SELECT ON "habits" TO authenticated;`;
    const { rows } = await asRole("authenticated", `SELECT * FROM "habits"`, setup);
    expect(rows).toEqual([]);
  });
});
