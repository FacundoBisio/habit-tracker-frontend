import { createMeHandlers } from "@/lib/server/me-handlers";
import { getMeDeps } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export const GET = (req: Request) => createMeHandlers(getMeDeps()).listTokens(req);
export const POST = (req: Request) => createMeHandlers(getMeDeps()).createToken(req);
export const DELETE = (req: Request) => createMeHandlers(getMeDeps()).revokeToken(req);
