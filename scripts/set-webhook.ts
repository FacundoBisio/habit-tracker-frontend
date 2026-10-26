/**
 * Registra el webhook de Telegram.
 * Uso: APP_URL=https://tu-app.vercel.app TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… npx tsx scripts/set-webhook.ts
 */
const { APP_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET } = process.env;

async function main() {
  if (!APP_URL || !TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBHOOK_SECRET) {
    throw new Error("Faltan APP_URL, TELEGRAM_BOT_TOKEN o TELEGRAM_WEBHOOK_SECRET");
  }
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: `${APP_URL.replace(/\/$/, "")}/api/telegram`,
      secret_token: TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: true,
    }),
  });
  console.log(res.status, await res.json());
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
