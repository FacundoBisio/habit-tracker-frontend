import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableName, isTable, type Table } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "./schema";

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
