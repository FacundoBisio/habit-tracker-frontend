# Bot de Telegram

## Crear el bot
1. En Telegram abrí **@BotFather** → `/newbot` → elegí nombre y usuario (termina en `bot`). Te da el **token** (`TELEGRAM_BOT_TOKEN`).
2. Inventá un `TELEGRAM_WEBHOOK_SECRET` (largo, solo `A-Z a-z 0-9 _ -`).
3. Cargá ambas variables en Vercel y redeployá.
4. Registrá el webhook (una vez, y cada vez que cambie la URL):
   ```bash
   APP_URL=https://tu-app.vercel.app TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… npx tsx scripts/set-webhook.ts
   ```
   Debe responder `200 { ok: true, result: true }`.

## Vincular tu cuenta
En la app: **Ajustes → Cuenta → Telegram → Generar código**. Mandale al bot `/vincular CÓDIGO` (vence en 15 minutos, un solo uso). Hasta vincular, el bot solo responde cómo hacerlo.

## Cómo se usa
Escribile como hablás; **siempre confirma antes de escribir**:

| Escribís | Pasa |
|---|---|
| `agua 3` | Resumen + botones ✅ Confirmar / ✏️ Corregir / ❌ Cancelar |
| `ayer gym` | Resuelve la fecha en tu zona horaria |
| `esta semana fui 3 veces al gym y leí 2 capítulos` | El LLM reparte los registros en días distintos de la semana |
| Tocar un hábito en el **teclado** (nombre exacto) | Registra al instante con botón ↩️ Deshacer |
| `yoga 15` (hábito que no existe) | Ofrece ➕ Crear «yoga» o 🔗 «yoga» es *Gym* (guarda alias) |

Después de registrar muestra el impacto: `✅ Gym · semana 3/3 · Gym 3x/sem 100%` y `🎉 Objetivo completado: …`.

### Comandos
`/hoy` · `/semana` · `/objetivos` · `/deshacer` (deshace el último mensaje completo) · `/recordatorios on|off|21:30` · `/teclado` · `/ayuda`

### Recordatorios
A la hora configurada, si te falta algo hoy: `🔔 Te falta hoy: …`. Los domingos a esa hora también llega el resumen semanal. Requiere el cron de `docs/cron.sql`.

## Sin LLM
Si se agotan las cuotas gratuitas o falla la API, el bot cae automáticamente a un parser por reglas que entiende frases cortas (`agua 3`, `gym`, `leí 20 min`, `ayer gym`). Las frases largas ("esta semana fui 3 veces…") necesitan el LLM.

## Tip iOS
Poné el widget de **Chats** de Telegram en la pantalla de inicio para abrir el bot con un toque.

## Seguridad
- El webhook valida el header `X-Telegram-Bot-Api-Secret-Token` (403 si no coincide).
- Las confirmaciones pendientes están atadas al chat que las generó.
- Los intentos de `/vincular` tienen límite (5 por minuto por chat).
