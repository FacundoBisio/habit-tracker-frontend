-- La app nunca lee tablas por la API pública de Supabase (PostgREST): todo pasa por el servidor,
-- que se conecta con el rol dueño de las tablas (se saltea la RLS) y filtra por user_id.
-- Así que: RLS activa SIN políticas (niega todo a anon y authenticated) y sin permisos para esos roles.
-- Al agregar una tabla nueva, sumarla acá en una migración (lib/db/rls.test.ts falla si falta).
DROP POLICY IF EXISTS "owner_all" ON "habits";--> statement-breakpoint
DROP POLICY IF EXISTS "owner_all" ON "entries";--> statement-breakpoint
DROP POLICY IF EXISTS "owner_all" ON "goals";--> statement-breakpoint
DROP POLICY IF EXISTS "owner_all" ON "goal_links";--> statement-breakpoint
DROP POLICY IF EXISTS "owner_all" ON "user_settings";--> statement-breakpoint
DROP POLICY IF EXISTS "owner_all" ON "api_tokens";--> statement-breakpoint
DROP POLICY IF EXISTS "owner_all" ON "link_codes";--> statement-breakpoint
DROP POLICY IF EXISTS "owner_all" ON "bot_pending";--> statement-breakpoint
ALTER TABLE "habits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "goal_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "api_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "link_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "bot_pending" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DO $$
BEGIN
  -- Los roles existen en Supabase; en un Postgres común (pruebas locales) se saltea.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  END IF;
END $$;
