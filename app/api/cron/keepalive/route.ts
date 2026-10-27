import { createDrizzleRepo } from "@/lib/server/drizzle-repo";
import { purgeStale } from "@/lib/telegram/reminders";
import { isCronAuthorized } from "@/lib/telegram/webhook";

export const dynamic = "force-dynamic";

/**
 * Toca la base (para evitar la pausa por inactividad de Supabase Free) sin enviar nada. De paso
 * purga códigos y confirmaciones viejas: respaldo semanal por si el cron de cada minuto no corre.
 */
async function run(req: Request) {
  if (!isCronAuthorized(req, process.env.CRON_SECRET)) return new Response("forbidden", { status: 403 });
  const repo = createDrizzleRepo();
  const targets = await repo.listReminderTargets();
  const purged = await purgeStale(repo, new Date());
  return Response.json({ ok: true, targets: targets.length, purged });
}

export const GET = run;
export const POST = run;
