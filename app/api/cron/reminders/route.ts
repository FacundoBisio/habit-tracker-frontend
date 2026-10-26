import { getBotDeps } from "@/lib/telegram/deps";
import { runReminders } from "@/lib/telegram/reminders";
import { isCronAuthorized } from "@/lib/telegram/webhook";

export const dynamic = "force-dynamic";

async function run(req: Request) {
  if (!isCronAuthorized(req, process.env.CRON_SECRET)) return new Response("forbidden", { status: 403 });
  const { repo, tg, now } = getBotDeps();
  const sent = await runReminders({ repo, tg, now });
  return Response.json({ ok: true, sent });
}

export const GET = run;
export const POST = run;
