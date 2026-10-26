# Hábitos

Tracker de hábitos y objetivos para usar a diario desde el iPhone: **PWA** instalable, **Atajos de iOS** (widget y Siri) y **bot de Telegram** con lenguaje natural. Todo en capa gratuita (Vercel Hobby + Supabase Free + Telegram + Gemini/Groq).

## Estado
- Fases 0–4 implementadas y testeadas (91 tests): dominio, PWA, API de Atajos, bot, sincronización.
- **Pendiente: conectar credenciales** (Supabase, Telegram, LLM, Vercel) y probar de punta a punta. Seguí **`docs/SETUP.md`**.
- Fase 5 (E2E Playwright, Lighthouse, revisión final) pendiente.

## Qué hace
- Registrar en 1–2 toques: tap = registrar, mantener = cantidad/nota/fecha, deshacer 5 s.
- Hábitos de sí/no y de cantidad; frecuencia diaria, X por semana o días fijos.
- Objetivos (cantidad, suma, frecuencia semanal, racha) con ritmo esperado vs real; cada registro suma solo a los vinculados.
- Stats: heatmap anual, rachas, cumplimiento a 30/90 días. Fechas siempre en tu zona horaria.
- Funciona sin señal (IndexedDB) y sincroniza con la nube al volver.
- API para Atajos: `/api/quick/habits|log|ingest` (ver `docs/IOS_SHORTCUTS.md`).
- Bot de Telegram: confirma antes de escribir, crea hábitos/alias al vuelo, recordatorios y resumen semanal (ver `docs/TELEGRAM.md`).

## Desarrollo local
```bash
npm install
cp .env.example .env.local   # sin variables la app funciona solo en el dispositivo
npm run dev
```
Scripts: `npm run lint` · `typecheck` · `test` · `build` · `db:generate` · `db:migrate`.

## Estructura
```
app/              rutas UI y app/api/{quick,me,sync,telegram,cron}
components/       UI
lib/domain/       lógica pura (fechas, rachas, objetivos, matching) — testeada
lib/store/        IndexedDB (Dexie) + outbox de sincronización
lib/sync/         plan de push/pull (puro) + motor de sync del cliente
lib/server/       Repo (memoria para tests, Drizzle en producción), handlers de API
lib/nl/           NLParser: Gemini → Groq → reglas
lib/telegram/     handler del bot, textos, recordatorios, webhook
lib/db/           esquema Drizzle, migraciones, RLS
docs/             arquitectura, free tier, guías, setup
```

## Seguridad
- El servidor nunca confía en un `user_id` del cliente: se deriva del JWT de Supabase o del token de API.
- Tokens de API: se muestran una vez y se guardan hasheados (SHA-256). Revocables.
- Webhook de Telegram con `secret_token`; cron con `CRON_SECRET`; comparaciones en tiempo constante.
- RLS activa en todas las tablas (`lib/db/rls.sql`). Ningún secreto en el cliente (solo `NEXT_PUBLIC_SUPABASE_*`, que son públicas por diseño).
- Rate limit por token en memoria (por instancia serverless: freno best-effort, no garantía global).
