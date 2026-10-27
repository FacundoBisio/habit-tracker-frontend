// Corre las migraciones solo en el deploy de producción de Vercel (los Preview comparten la base
// de producción y no deben tocarla). Si la conexión directa no responde desde el build, reintenta
// por el pooler. Uso: `node scripts/migrate-if-prod.mjs` (lo llama vercel.json antes del build).
import { spawnSync } from "node:child_process";

const env = process.env.VERCEL_ENV;
if (env && env !== "production") {
  console.log(`[migrate] VERCEL_ENV=${env}: no se migra (solo producción).`);
  process.exit(0);
}
if (!env && !process.argv.includes("--force")) {
  console.log("[migrate] fuera de Vercel: usá `npm run db:migrate` o pasá --force.");
  process.exit(0);
}

const run = (extra = {}) =>
  spawnSync("npx", ["drizzle-kit", "migrate"], { env: { ...process.env, ...extra }, encoding: "utf8", shell: process.platform === "win32" });

let r = run();
process.stdout.write(r.stdout ?? "");
process.stderr.write(r.stderr ?? "");
const out = `${r.stdout}\n${r.stderr}`;
if (r.status !== 0 && /ENOTFOUND|ENETUNREACH|EHOSTUNREACH|ECONNREFUSED|ETIMEDOUT|CONNECT_TIMEOUT/i.test(out)) {
  console.log("[migrate] la conexión directa no respondió; reintento por el pooler.");
  r = run({ MIGRATE_WITH_POOLER: "1" });
  process.stdout.write(r.stdout ?? "");
  process.stderr.write(r.stderr ?? "");
}
process.exit(r.status ?? 1);
