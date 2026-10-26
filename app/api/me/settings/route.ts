import { createMeHandlers } from "@/lib/server/me-handlers";
import { getMeDeps } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export const GET = (req: Request) => createMeHandlers(getMeDeps()).getSettings(req);
export const PATCH = (req: Request) => createMeHandlers(getMeDeps()).patchSettings(req);
