import { createMeHandlers } from "@/lib/server/me-handlers";
import { getMeDeps } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Elimina la cuenta y todos sus datos (pide `{ "confirm": "ELIMINAR" }`). */
export const DELETE = (req: Request) => createMeHandlers(getMeDeps()).deleteAccount(req);
