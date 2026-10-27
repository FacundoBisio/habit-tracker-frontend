import { createMeHandlers } from "@/lib/server/me-handlers";
import { getMeDeps } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Desvincula Telegram (borra el chat y apaga los recordatorios). */
export const DELETE = (req: Request) => createMeHandlers(getMeDeps()).unlinkTelegram(req);
