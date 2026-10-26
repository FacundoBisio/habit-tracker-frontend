# Backlog

- Login con Google (OAuth) en la PWA de iOS.
- Web push (poco confiable en iOS; Telegram cubre recordatorios).
- Links iCloud directos a Atajos.
- `npm audit`: esbuild moderado vía drizzle-kit (solo dev, no llega a producción); revisar al actualizar drizzle-kit.
- Recordatorios tolerantes a un minuto perdido del cron (hoy se envían solo si el minuto coincide exacto; requeriría guardar la última fecha enviada).
- Rate limit global (hoy por instancia serverless); usar una tabla o KV si hiciera falta.
- Tests E2E de sincronización con IndexedDB real (hoy el plan de push/pull es puro y está testeado; el motor del cliente se verificó manualmente).
- Ediciones de entradas (hoy solo crear/borrar): requeriría un campo `updated_at` para resolver conflictos.
- Ver `docs/ROADMAP.md` (features por impacto) y `docs/AUDIT.md` (riesgos abiertos).
- CI: sumar los E2E de Playwright a `ci.yml` (hoy solo corren en local).
- Colorear también la racha en Stats con los mismos umbrales (10 / 30).
