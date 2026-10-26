import { createMeHandlers } from "@/lib/server/me-handlers";
import { getMeDeps } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export const POST = (req: Request) => createMeHandlers(getMeDeps()).createLinkCode(req);
