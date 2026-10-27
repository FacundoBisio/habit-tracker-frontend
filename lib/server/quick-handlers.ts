import { z } from "zod";
import { addDays, toLocalDate } from "@/lib/domain/dates";
import { resolveHabit } from "@/lib/domain/match";
import { resolveItems, type NLParser } from "@/lib/nl/types";
import type { Repo, ServerHabit } from "./repo";
import { deterministicUuid, hashToken } from "./security";
import { fmtNum, impactSummary, refreshGoals } from "./service";
import { glyph } from "@/lib/habit-icons";
import { MAX_AMOUNT } from "./validate";

export interface QuickDeps {
  repo: Repo;
  parser: NLParser;
  limiter: (key: string) => { ok: true } | { ok: false; retryAfterSec: number };
  now: () => Date;
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date debe ser YYYY-MM-DD");
const uuid = z.string().uuid();

const logBody = z.object({
  habit: z.string().min(1),
  amount: z.number().positive().max(MAX_AMOUNT).optional(),
  date: dateStr.optional(),
  note: z.string().max(500).optional(),
  client_id: uuid.optional(),
});

const ingestBody = z.object({
  text: z.string().min(1).max(1000),
  confirm: z.boolean().optional(),
  client_id: uuid.optional(),
});

/** JSON siempre; texto plano con `?format=text` o `Accept: text/plain` (los Atajos lo muestran directo). */
function respond(req: Request, status: number, text: string, data: Record<string, unknown> = {}, headers: HeadersInit = {}) {
  const accept = req.headers.get("accept") ?? "";
  const wantsText = new URL(req.url).searchParams.get("format") === "text" || accept.includes("text/plain");
  if (wantsText) return new Response(text, { status, headers: { "content-type": "text/plain; charset=utf-8", ...headers } });
  return Response.json({ ok: status < 400, text, ...data }, { status, headers });
}

async function authenticate(req: Request, deps: QuickDeps): Promise<{ userId: string } | Response> {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return respond(req, 401, "Falta el token (Authorization: Bearer …)");
  const token = await deps.repo.findToken(hashToken(m[1]));
  if (!token) return respond(req, 401, "Token inválido o revocado");
  const limit = deps.limiter(token.id);
  if (!limit.ok) {
    return respond(req, 429, "Demasiados pedidos, probá en unos segundos", {}, { "retry-after": String(limit.retryAfterSec) });
  }
  await deps.repo.touchToken(token.id);
  return { userId: token.userId };
}

/** Tope del cuerpo de los endpoints rápidos: lo legítimo pesa unos cientos de bytes. */
export const MAX_BODY_BYTES = 16 * 1024;

/**
 * Lee el cuerpo como texto cortando en `max` bytes. Mira `content-length` (rechazo barato) y además
 * cuenta lo realmente leído: el header puede faltar (chunked) o mentir.
 */
async function readLimitedText(req: Request, max: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

async function readJson<T>(req: Request, schema: z.ZodType<T>): Promise<{ data: T } | Response> {
  const body = await readLimitedText(req, MAX_BODY_BYTES);
  if (body === null) return respond(req, 413, "El cuerpo es demasiado grande");
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return respond(req, 400, "El cuerpo debe ser JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return respond(req, 400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  return { data: parsed.data };
}

const label = (h: ServerHabit) => `${glyph(h.emoji)} ${h.name}`;

export function createQuickHandlers(deps: QuickDeps) {
  return {
    async habits(req: Request) {
      const auth = await authenticate(req, deps);
      if (auth instanceof Response) return auth;
      const habits = (await deps.repo.listHabits(auth.userId)).filter((h) => !h.archived);
      return respond(req, 200, habits.map((h) => h.name).join("\n"), {
        habits: habits.map((h) => ({
          id: h.id,
          name: h.name,
          emoji: glyph(h.emoji),
          kind: h.kind,
          unit: h.unit ?? null,
          default_amount: h.defaultAmount,
        })),
      });
    },

    async log(req: Request) {
      const auth = await authenticate(req, deps);
      if (auth instanceof Response) return auth;
      const body = await readJson(req, logBody);
      if (body instanceof Response) return body;
      const { habit: query, amount, date, note, client_id } = body.data;

      const now = deps.now();
      const settings = await deps.repo.getSettings(auth.userId);
      const today = toLocalDate(now, settings.timezone);
      // Mismo margen que el parser NL: hasta un año atrás. Mañana se tolera (el reloj o la zona del
      // dispositivo pueden ir adelantados respecto de la zona configurada); más allá, no.
      if (date && date > addDays(today, 1)) return respond(req, 400, "La fecha no puede ser futura");
      if (date && date < addDays(today, -366)) return respond(req, 400, "La fecha no puede ser de hace más de un año");

      const habits = (await deps.repo.listHabits(auth.userId)).filter((h) => !h.archived);
      const match = resolveHabit(habits, query);
      if (match.type === "none") return respond(req, 404, `No encontré el hábito “${query}”`);
      if (match.type === "ambiguous") {
        return respond(req, 409, `“${query}” coincide con varios: ${match.candidates.map((c) => c.name).join(", ")}`, {
          candidates: match.candidates.map((c) => c.name),
        });
      }
      const habit = match.habit;
      const qty = amount ?? habit.defaultAmount;

      const { entry, duplicate } = await deps.repo.insertEntry(auth.userId, {
        habitId: habit.id,
        amount: qty,
        localDate: date ?? today,
        occurredAt: now,
        note,
        source: "shortcut",
        clientId: client_id ?? crypto.randomUUID(),
      });
      if (duplicate) {
        return respond(req, 200, `↩️ ${label(habit)} ya estaba registrado`, { duplicate: true, entry_id: entry.id });
      }
      const completed = await refreshGoals(deps.repo, auth.userId, settings, today);
      const text = await impactSummary(deps.repo, auth.userId, habit, qty, now, completed);
      return respond(req, 200, text, { duplicate: false, entry_id: entry.id, completed_goals: completed });
    },

    async ingest(req: Request) {
      const auth = await authenticate(req, deps);
      if (auth instanceof Response) return auth;
      const body = await readJson(req, ingestBody);
      if (body instanceof Response) return body;
      const { text, confirm, client_id } = body.data;

      const now = deps.now();
      const settings = await deps.repo.getSettings(auth.userId);
      const today = toLocalDate(now, settings.timezone);
      const habits = (await deps.repo.listHabits(auth.userId)).filter((h) => !h.archived);

      const parsed = await deps.parser.parse(text, { habits, today, timezone: settings.timezone });
      const { resolved, unmatched } = resolveItems(parsed, habits);

      const describe = (r: { habit: ServerHabit; amount: number; localDate: string }) =>
        `• ${label(r.habit)}${r.habit.kind === "quantity" ? ` +${fmtNum(r.amount)}${r.habit.unit ? ` ${r.habit.unit}` : ""}` : ""}${r.localDate === today ? "" : ` (${r.localDate})`}`;
      const unmatchedLines = unmatched.map((u) => `• ❓ “${u.term}” no coincide con ningún hábito`);

      const understood = resolved.map((r) => ({
        habit: r.habit.name,
        habit_id: r.habit.id,
        amount: r.amount,
        date: r.localDate,
      }));

      if (!resolved.length) {
        return respond(req, 200, ["No pude registrar nada.", ...unmatchedLines].join("\n"), { understood, unmatched, registered: false });
      }

      if (!confirm) {
        return respond(req, 200, ["Entendí:", ...resolved.map(describe), ...unmatchedLines].join("\n"), {
          understood,
          unmatched,
          registered: false,
        });
      }

      // Idempotencia: mismo client_id + índice → mismo client_id por ítem. Sin client_id solo
      // deduplicamos reintentos inmediatos (mismo texto dentro del mismo minuto): dos registros
      // iguales y deliberados el mismo día ("agua 1" a la mañana y a la tarde) cuentan los dos.
      const seed = client_id ?? `${text}|${Math.floor(now.getTime() / 60_000)}`;
      const lines: string[] = [];
      const completedAll: string[] = [];
      for (const [i, r] of resolved.entries()) {
        const { duplicate } = await deps.repo.insertEntry(auth.userId, {
          habitId: r.habit.id,
          amount: r.amount,
          localDate: r.localDate,
          occurredAt: now,
          note: r.note,
          source: "siri",
          rawInput: text,
          clientId: deterministicUuid(`${auth.userId}|${seed}|${i}`),
        });
        lines.push(duplicate ? `↩️ ${label(r.habit)} ya estaba registrado` : describe(r));
      }
      completedAll.push(...(await refreshGoals(deps.repo, auth.userId, settings, today)));
      const out = ["✅ Registrado:", ...lines, ...unmatchedLines, ...completedAll.map((t) => `🎉 Objetivo completado: ${t}`)];
      return respond(req, 200, out.join("\n"), { understood, unmatched, registered: true, completed_goals: completedAll });
    },
  };
}
