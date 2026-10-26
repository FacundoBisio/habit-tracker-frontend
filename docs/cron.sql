-- Recordatorios de Telegram: invoca la app cada minuto (Vercel Hobby solo permite crons diarios).
-- Ejecutar en el SQL Editor de Supabase DESPUÉS de habilitar pg_cron y pg_net.
-- Reemplazá TU-APP y TU_CRON_SECRET (el mismo valor que la variable CRON_SECRET de Vercel).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'habit-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://TU-APP.vercel.app/api/cron/reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer TU_CRON_SECRET',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $$
);

-- Para desactivarlo:  select cron.unschedule('habit-reminders');
-- Para ver ejecuciones: select * from cron.job_run_details order by start_time desc limit 10;
