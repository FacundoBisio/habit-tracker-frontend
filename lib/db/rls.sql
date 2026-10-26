-- Ejecutar después de las migraciones de Drizzle (Supabase SQL editor o `psql`).
-- El servidor accede con el rol postgres (bypassa RLS) y filtra por user_id;
-- RLS queda como defensa en profundidad ante cualquier acceso directo con la anon key.
do $$
declare t text;
begin
  foreach t in array array['habits','entries','goals','goal_links','user_settings','api_tokens','link_codes']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "owner_all" on %I', t);
    execute format(
      'create policy "owner_all" on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end $$;
