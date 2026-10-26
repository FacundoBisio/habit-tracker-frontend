import { createDrizzleRepo } from "@/lib/server/drizzle-repo";
import { isCronAuthorized } from "@/lib/telegram/webhook";

export const dynamic = "force-dynamic";

/** Toca la base (para evitar la pausa por inactividad de Supabase Free) sin enviar nada. */
async function run(req: Request) {
  if (!isCronAuthorized(req, process.env.CRON_SECRET)) return new Response("forbidden", { status: 403 });
  const targets = await createDrizzleRepo().listReminderTargets();
  return Response.json({ ok: true, targets: targets.length });
}

export const GET = run;
export const POST = run;
