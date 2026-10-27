import { getBotDeps } from "@/lib/telegram/deps";
import { runCronTick } from "@/lib/telegram/reminders";
import { isCronAuthorized } from "@/lib/telegram/webhook";

export const dynamic = "force-dynamic";

/** Cada minuto: recordatorios; una vez por día además purga códigos y confirmaciones viejas. */
async function run(req: Request) {
  if (!isCronAuthorized(req, process.env.CRON_SECRET)) return new Response("forbidden", { status: 403 });
  const { repo, tg, now } = getBotDeps();
  const { sent, purged } = await runCronTick({ repo, tg, now });
  return Response.json({ ok: true, sent, purged });
}

export const GET = run;
export const POST = run;
