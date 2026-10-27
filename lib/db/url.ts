// URL de Postgres: DATABASE_URL si existe; si no, POSTGRES_URL que carga la
// integración Supabase ↔ Vercel (pooler en modo transacción).
export function databaseUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  const raw = env.DATABASE_URL || env.POSTGRES_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    // La integración agrega `supa=base-pooler.x`; postgres.js lo mandaría como parámetro de sesión.
    url.searchParams.delete("supa");
    return url.toString();
  } catch {
    return raw;
  }
}
