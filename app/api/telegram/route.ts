import { getBotDeps } from "@/lib/telegram/deps";
import { handleWebhook } from "@/lib/telegram/webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = (req: Request) => handleWebhook(req, getBotDeps(), process.env.TELEGRAM_WEBHOOK_SECRET);
