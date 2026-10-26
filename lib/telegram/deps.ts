import { getDefaultParser } from "@/lib/nl";
import { createDrizzleRepo } from "@/lib/server/drizzle-repo";
import { createRateLimiter } from "@/lib/server/security";
import { createTelegramClient } from "./api";
import type { BotDeps } from "./handler";

declare global {
  var __linkLimiter: ReturnType<typeof createRateLimiter> | undefined;
}

export function getBotDeps(): BotDeps {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN no está definida");
  globalThis.__linkLimiter ??= createRateLimiter(5, 60_000);
  return {
    repo: createDrizzleRepo(),
    parser: getDefaultParser(),
    tg: createTelegramClient(token),
    now: () => new Date(),
    linkLimiter: globalThis.__linkLimiter,
  };
}
