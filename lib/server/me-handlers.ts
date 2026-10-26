import { z } from "zod";
import type { Repo } from "./repo";
import { generateLinkCode, generateToken } from "./security";

export interface MeDeps {
  repo: Repo;
  /** Resuelve el usuario de la sesión (JWT de Supabase en `Authorization: Bearer`). */
  getUserId: (req: Request) => Promise<string | null>;
  now: () => Date;
}

const MAX_ACTIVE_TOKENS = 10;
const LINK_CODE_TTL_MS = 15 * 60_000;

const validZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("es-AR", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const settingsPatch = z
  .object({
    timezone: z.string().refine(validZone, "zona horaria inválida"),
    weekStartsOn: z.union([z.literal(0), z.literal(1), z.literal(6)]),
    reminderTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "formato HH:MM"),
    remindersEnabled: z.boolean(),
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
        await deps.repo.updateSettings(userId, body.data);
        return Response.json(await deps.repo.getSettings(userId));
      }),
  };
}
