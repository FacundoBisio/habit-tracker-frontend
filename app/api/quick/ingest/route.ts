import { createQuickHandlers } from "@/lib/server/quick-handlers";
import { getQuickDeps } from "@/lib/server/deps";

export const dynamic = "force-dynamic";

export const POST = (req: Request) => createQuickHandlers(getQuickDeps()).ingest(req);
