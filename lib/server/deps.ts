import { getDefaultParser } from "@/lib/nl";
import { createDrizzleRepo } from "./drizzle-repo";
import type { QuickDeps } from "./quick-handlers";
import { createRateLimiter } from "./security";

declare global {
  var __quickLimiter: ReturnType<typeof createRateLimiter> | undefined;
}

/** 60 pedidos por minuto por token (por instancia serverless). */
export function getQuickDeps(): QuickDeps {
  globalThis.__quickLimiter ??= createRateLimiter(60, 60_000);
  return {
    repo: createDrizzleRepo(),
    parser: getDefaultParser(),
    limiter: globalThis.__quickLimiter,
    now: () => new Date(),
  };
}
