# Habit Tracker

Tracker de hábitos y objetivos para usar a diario desde el iPhone (PWA + Atajos de iOS + bot de Telegram), 100% en capa gratuita.

Estado: **Fase 1 completa** (base, dominio testeado, esquema de DB). Ver `docs/PROGRESS.md`.

## Setup local
```bash
npm install
cp .env.example .env.local   # completar variables
npm run dev
```

## Scripts
`npm run lint` · `npm run typecheck` · `npm test` · `npm run build` · `npm run db:generate` · `npm run db:migrate`

## Base de datos
1. Crear proyecto en Supabase y completar `DATABASE_URL` (pooler, modo Transaction).
2. `npm run db:migrate`, luego ejecutar `lib/db/rls.sql` en el SQL editor.
3. Opcional: `SEED_USER_ID=<uuid> npx tsx lib/db/seed.ts`.

## Documentación
`docs/ARCHITECTURE.md` · `docs/FREE_TIER.md` · `docs/BACKLOG.md`
