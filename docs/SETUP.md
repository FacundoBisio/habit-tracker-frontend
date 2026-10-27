# Puesta en marcha: dónde va cada credencial

Todo el código de las Fases 1–4 está hecho y testeado con repositorios en memoria y clientes falsos. Lo que **no** se pudo probar sin credenciales: la conexión real a Supabase, el envío real a Telegram/Gemini/Groq y el uso desde un iPhone. Seguí estos pasos en orden.

## Mapa de variables

| Variable | De dónde sale | Dónde se carga | Qué habilita |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL | `.env.local` **y** Vercel | Login, sincronización |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → `anon` `public` | `.env.local` **y** Vercel | Login (valida la sesión en el servidor) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` (**secreta**: nunca con prefijo `NEXT_PUBLIC_`) | Solo Vercel (y `.env.local` si probás local) | Eliminar la cuenta desde Ajustes (borra el usuario de Supabase Auth) |
| `DATABASE_URL` | Supabase → Connect → **Transaction pooler** (puerto 6543) | `.env.local` **y** Vercel | Toda la API (`/api/quick`, `/api/me`, `/api/sync`, bot) y las migraciones |
| `TELEGRAM_BOT_TOKEN` | @BotFather → `/newbot` | Vercel (y `.env.local` para el script) | Bot |
| `TELEGRAM_WEBHOOK_SECRET` | Lo inventás vos (string largo aleatorio, `A-Z a-z 0-9 _ -`) | Vercel (y `.env.local`) | Autenticar el webhook |
| `CRON_SECRET` | Lo inventás vos | Vercel, SQL del cron y secreto de GitHub | Recordatorios |
| `GEMINI_API_KEY` | https://aistudio.google.com → Get API key | Vercel | Lenguaje natural (principal) |
| `GROQ_API_KEY` (opcional) | https://console.groq.com → API Keys | Vercel | Lenguaje natural (respaldo) |
| `GEMINI_MODEL` / `GROQ_MODEL` (opcionales) | — | Vercel | Cambiar de modelo sin tocar código |

Sin las claves del LLM el bot y los Atajos siguen funcionando con el **parser por reglas** ("agua 3", "ayer gym", "leí 20 min").

> **Verificá el nombre del modelo de Gemini** al cargar la key: el default es `gemini-2.5-flash-lite` y los límites free de Google cambian seguido. Si da error 404/429, poné otro en `GEMINI_MODEL` o dejá que caiga a Groq/reglas. Anotá el límite real en `docs/FREE_TIER.md`.

## Pasos (en orden)

### 1. Supabase
1. Crear proyecto (plan Free). Guardar la contraseña de la base.
2. **Authentication → Providers → Email**: activado. En **Authentication → Email Templates → Magic Link** reemplazá el cuerpo para que muestre el código: `Tu código es {{ .Token }}`.
3. Copiar las tres variables de la tabla.
4. En tu máquina: copiá `.env.example` a `.env.local`, completá `DATABASE_URL` y corré `npm run db:migrate` (incluye `0003`: el nombre sincronizado en `user_settings.display_name`).
5. En el **SQL Editor** de Supabase pegá y ejecutá `lib/db/rls.sql` (activa RLS en todas las tablas).
6. **Database → Extensions**: habilitá `pg_cron` y `pg_net`.

### 2. Vercel
1. Importar el repo `habit-tracker-frontend` de GitHub (plan Hobby).
2. Cargar **todas** las variables de la tabla (las `NEXT_PUBLIC_*` se leen en el build: si las agregás después, redeployá).
3. Deploy. Anotá la URL (`https://….vercel.app`).

### 3. Primer ingreso
1. Abrí la URL en el iPhone con Safari → **Compartir → Agregar a pantalla de inicio**.
2. **Ajustes → Cuenta**: ingresá tu email, escribí el código de 6 dígitos que te llega y listo. La primera vez se suben a la nube los datos que ya tenías en el dispositivo.

### 4. Telegram
Ver `docs/TELEGRAM.md`. Resumen: crear el bot en @BotFather, cargar las dos variables, y correr
`APP_URL=https://… TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… npx tsx scripts/set-webhook.ts`.
Después, en la app: **Ajustes → Telegram → Generar código** y mandarle `/vincular CÓDIGO` al bot.

### 5. Recordatorios (cron cada minuto)
Vercel Hobby solo permite crons diarios, así que se usa Supabase. En el SQL Editor ejecutá `docs/cron.sql` reemplazando `TU-APP` y `TU_CRON_SECRET`.
Activá los recordatorios con `/recordatorios 21:30` en el bot o desde Ajustes.

### 6. GitHub Actions (anti-pausa de Supabase)
En el repo → **Settings → Secrets and variables → Actions** creá `APP_URL` y `CRON_SECRET`. El workflow `.github/workflows/keepalive.yml` pega una vez por semana a la app (que consulta la base) para evitar la pausa por inactividad del plan Free.

### 7. Atajos de iOS
Ver `docs/IOS_SHORTCUTS.md`. El token se crea en **Ajustes → Cuenta → Atajos de iOS**.

## Checklist de humo (después de configurar)
- [ ] Abrir la app, iniciar sesión con el código y ver "Sincronizado" abajo.
- [ ] Crear un hábito en la app → aparece en `GET /api/quick/habits?format=text` con tu token.
- [ ] `curl -X POST $URL/api/quick/log?format=text -H "Authorization: Bearer $TOKEN" -H "content-type: application/json" -d '{"habit":"Agua"}'` → responde `✅ Agua …` y a la vuelta (≤1 min) aparece en la app.
- [ ] Escribirle al bot "agua 3" → botones ✅/✏️/❌ → confirmar → aparece en la app.
- [ ] `/recordatorios 21:30` y revisar que a esa hora llegue el aviso (si algo falta).
- [ ] Revisar en Supabase → Logs que no haya errores de conexión (si hay, confirmar que `DATABASE_URL` es el pooler de transacción).
