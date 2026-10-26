import { createSyncHandlers } from "@/lib/server/sync-handlers";
import { getMeDeps } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export const GET = (req: Request) => createSyncHandlers(getMeDeps()).pull(req);
export const POST = (req: Request) => createSyncHandlers(getMeDeps()).push(req);
