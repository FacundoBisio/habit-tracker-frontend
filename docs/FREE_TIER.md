# Límites de capa gratuita (verificados 2026-10-26)

| Servicio | Límite relevante | Fuente | Uso esperado |
|---|---|---|---|
| Vercel Hobby | 1M invocaciones/mes, 100 GB transfer, funciones hasta 300 s, 100 deploys/día, **solo uso no comercial** | https://vercel.com/docs/plans/hobby | ~300 req/día |
| Vercel Cron (Hobby) | **1 vez por día, precisión ±59 min** | https://vercel.com/docs/cron-jobs/usage-and-pricing | No sirve para recordatorios → ver abajo |
| Supabase Free | 500 MB DB, 50k MAU, 5 GB egress, 2 proyectos activos, **pausa tras 1 semana sin actividad** | https://supabase.com/pricing | < 10 MB, 1 usuario |
| Supabase pg_cron + pg_net | Disponibles en hosted (confirmar en Dashboard → Database → Extensions) | https://supabase.com/docs/guides/functions/schedule-functions | 1 job/minuto |
| Telegram Bot API | ~1 msg/s por chat, 20 msg/min en grupos; gratis | https://core.telegram.org/bots/faq | < 50 msg/día |
| Groq (free) | `openai/gpt-oss-20b`: 30 RPM / 1K RPD / 8K TPM / 200K TPD | https://console.groq.com/docs/rate-limits | < 50 req/día |
| Gemini API (free) | **Sin verificar**: la doc oficial remite a AI Studio (requiere login) y fuentes terceras se contradicen. Se mide con una llamada real en Fase 1. | https://ai.google.dev/gemini-api/docs/rate-limits | < 50 req/día |

## Mitigaciones
- **Cron de recordatorios**: Supabase `pg_cron` + `pg_net` cada minuto → `POST /api/cron/reminders` (header secreto). Respaldo: GitHub Actions programado.
- **Pausa de Supabase**: el uso diario y el cron mantienen actividad; además un workflow semanal de GitHub Actions hace un ping a la DB.
- **Cuota del LLM**: interfaz `NLParser` con fallback Gemini → Groq → parser por reglas.
- **Hobby no comercial**: el proyecto es de uso personal; no monetizar.
