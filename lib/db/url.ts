// URL de Postgres: DATABASE_URL si existe; si no, POSTGRES_URL que carga la
// integración Supabase ↔ Vercel (pooler en modo transacción).
export function databaseUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  return clean(env.DATABASE_URL || env.POSTGRES_URL);
}

/**
 * URL para migraciones (DDL): conexión directa o en modo sesión si existe (MIGRATION_DATABASE_URL o
 * POSTGRES_URL_NON_POOLING de la integración); si no, la misma de la app.
 */
export function migrationUrl(env: Record<string, string | undefined> = process.env): string | undefined {
  return clean(env.MIGRATION_DATABASE_URL || env.POSTGRES_URL_NON_POOLING) ?? databaseUrl(env);
}

function clean(raw: string | undefined): string | undefined {
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
