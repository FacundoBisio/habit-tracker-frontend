import { z } from "zod";
import { nameSchema } from "@/lib/domain/name";
import type { Repo } from "./repo";
import { createRateLimiter, generateLinkCode, generateToken } from "./security";
import { isValidTimeZone } from "./validate";

export interface MeDeps {
  repo: Repo;
  /** Resuelve el usuario de la sesión (JWT de Supabase en `Authorization: Bearer`). */
  getUserId: (req: Request) => Promise<string | null>;
  now: () => Date;
  /** Borra el usuario de Supabase Auth (con la service role key, solo en el servidor). */
  deleteAuthUser?: (userId: string) => Promise<void>;
  /** Mensaje por el bot (best effort: si falla no frena nada). */
  sendTelegram?: (chatId: string, text: string) => Promise<void>;
  /** Límite de intentos de borrado por usuario. */
  deleteLimiter?: ReturnType<typeof createRateLimiter>;
}

export const DELETE_CONFIRM = "ELIMINAR";
const GOODBYE = "Tu cuenta de SuperHábitos se eliminó junto con todos tus datos. ¡Gracias por usarla!";

const MAX_ACTIVE_TOKENS = 10;
const LINK_CODE_TTL_MS = 15 * 60_000;


const settingsPatch = z
  .object({
    timezone: z.string().refine(isValidTimeZone, "zona horaria inválida"),
    weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(6)]),
    reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "formato HH:MM"),
    remindersEnabled: z.boolean(),
    displayName: nameSchema,
  })
  .partial()
  .strict();

const unauthorized = () => Response.json({ ok: false, error: "No autenticado" }, { status: 401 });

export function createMeHandlers(deps: MeDeps) {
  async function withUser(req: Request, fn: (userId: string) => Promise<Response>) {
    const userId = await deps.getUserId(req);
    return userId ? fn(userId) : unauthorized();
  }

  return {
    listTokens: (req: Request) =>
      withUser(req, async (userId) => {
        const tokens = await deps.repo.listTokens(userId);
        return Response.json({
          tokens: tokens.map((t) => ({
            id: t.id,
            name: t.name,
            lastUsedAt: t.lastUsedAt,
            revokedAt: t.revokedAt,
            createdAt: t.createdAt,
          })),
        });
      }),

    /** El token en claro solo se devuelve acá, una vez. */
    createToken: (req: Request) =>
      withUser(req, async (userId) => {
        const body = z.object({ name: z.string().min(1).max(60) }).safeParse(await req.json().catch(() => null));
        if (!body.success) return Response.json({ ok: false, error: "name requerido" }, { status: 400 });
        const active = (await deps.repo.listTokens(userId)).filter((t) => !t.revokedAt);
        if (active.length >= MAX_ACTIVE_TOKENS) {
          return Response.json({ ok: false, error: "Demasiados tokens activos; revocá alguno" }, { status: 400 });
        }
        const { token, hash } = generateToken();
        const { id } = await deps.repo.createToken(userId, body.data.name, hash);
        return Response.json({ id, token }, { status: 201 });
      }),

    revokeToken: (req: Request) =>
      withUser(req, async (userId) => {
        const id = new URL(req.url).searchParams.get("id");
        if (!id) return Response.json({ ok: false, error: "id requerido" }, { status: 400 });
        await deps.repo.revokeToken(userId, id);
        return Response.json({ ok: true });
      }),

    createLinkCode: (req: Request) =>
      withUser(req, async (userId) => {
        const code = generateLinkCode();
        const expiresAt = new Date(deps.now().getTime() + LINK_CODE_TTL_MS);
        await deps.repo.createLinkCode(userId, code, expiresAt);
        return Response.json({ code, expiresAt }, { status: 201 });
      }),

    getSettings: (req: Request) => withUser(req, async (userId) => Response.json(await deps.repo.getSettings(userId))),

    patchSettings: (req: Request) =>
      withUser(req, async (userId) => {
        const body = settingsPatch.safeParse(await req.json().catch(() => null));
        if (!body.success) {
          return Response.json({ ok: false, error: body.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
        }
        const patch = body.data.displayName !== undefined ? { ...body.data, displayNameUpdatedAt: deps.now().getTime() } : body.data;
        await deps.repo.updateSettings(userId, patch);
        return Response.json(await deps.repo.getSettings(userId));
      }),

    /**
     * Elimina la cuenta: primero los datos (idempotente) y después el usuario de Auth. Si falla Auth se responde
     * `retry: true`; reintentar es seguro.
     */
    deleteAccount: (req: Request) =>
      withUser(req, async (userId) => {
        const body = z.object({ confirm: z.literal(DELETE_CONFIRM) }).safeParse(await req.json().catch(() => null));
        if (!body.success) return Response.json({ ok: false, error: `Falta la confirmación "${DELETE_CONFIRM}"` }, { status: 400 });
        const limit = deps.deleteLimiter?.(userId, deps.now().getTime());
        if (limit && !limit.ok) {
          return Response.json({ ok: false, error: "Demasiados intentos" }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
        }
        const { telegramChatId } = await deps.repo.getSettings(userId);
        await deps.repo.deleteUserData(userId);
        if (telegramChatId && deps.sendTelegram) await deps.sendTelegram(telegramChatId, GOODBYE).catch(() => {});
        try {
          await deps.deleteAuthUser?.(userId);
        } catch {
          return Response.json({ ok: false, error: "No se pudo terminar de eliminar la cuenta", retry: true }, { status: 500 });
        }
        return Response.json({ ok: true });
      }),

    unlinkTelegram: (req: Request) =>
      withUser(req, async (userId) => {
        await deps.repo.unlinkTelegram(userId);
        return Response.json({ ok: true });
      }),
  };
}
