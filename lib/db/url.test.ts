import { describe, expect, it } from "vitest";
import { databaseUrl } from "./url";

describe("databaseUrl", () => {
  it("prefiere DATABASE_URL", () => {
    expect(databaseUrl({ DATABASE_URL: "postgres://a@h:6543/db", POSTGRES_URL: "postgres://b@h/db" })).toBe("postgres://a@h:6543/db");
  });

  it("usa POSTGRES_URL de la integración y quita el parámetro supa", () => {
    const url = databaseUrl({ POSTGRES_URL: "postgres://u:p@pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x" });
    expect(url).toBe("postgres://u:p@pooler.supabase.com:6543/postgres?sslmode=require");
  });

  it("devuelve undefined sin variables", () => {
    expect(databaseUrl({})).toBeUndefined();
  });
});
