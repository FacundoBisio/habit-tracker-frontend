import { defineConfig } from "drizzle-kit";
import { databaseUrl, migrationUrl } from "./lib/db/url";

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.MIGRATE_WITH_POOLER ? (databaseUrl() ?? "") : (migrationUrl() ?? "") },
});
