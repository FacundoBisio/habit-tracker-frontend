import { and, asc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, ne, or } from "drizzle-orm";
import type { WeekStart } from "@/lib/domain/types";
import { getDb } from "@/lib/db/client";
import * as t from "@/lib/db/schema";
import type { Repo, ServerEntry, ServerGoal, ServerHabit, ServerSettings } from "./repo";
import { DEFAULT_SERVER_SETTINGS } from "./repo";

type HabitRow = typeof t.habits.$inferSelect;
type EntryRow = typeof t.entries.$inferSelect;
type SettingsRow = typeof t.userSettings.$inferSelect;

const toHabit = (r: HabitRow): ServerHabit => ({
  id: r.id,
  name: r.name,
  emoji: r.emoji,
  color: r.color,
  kind: r.kind,
  unit: r.unit ?? undefined,
  defaultAmount: r.defaultAmount,
  schedule: r.schedule,
  archived: r.archived,
  sortOrder: r.sortOrder,
  aliases: r.aliases,
});

const toEntry = (r: EntryRow): ServerEntry => ({
  id: r.id,
  habitId: r.habitId,
  localDate: r.localDate,
  occurredAt: r.occurredAt,
  amount: r.amount,
  note: r.note ?? undefined,
  source: r.source,
  rawInput: r.rawInput ?? undefined,
  clientId: r.clientId,
});

const toSettings = (r: SettingsRow): ServerSettings => ({
  timezone: r.timezone,
  weekStartsOn: r.weekStartsOn as WeekStart,
  telegramChatId: r.telegramChatId ?? undefined,
  reminderTime: r.reminderTime,
  remindersEnabled: r.remindersEnabled,
  displayName: r.displayName ?? undefined,
  displayNameUpdatedAt: r.displayNameUpdatedAt?.getTime(),
});

/** Implementación de producción. Toda consulta filtra por `user_id` (la conexión bypassa RLS). */
export function createDrizzleRepo(): Repo {
  const db = getDb();

  const repo: Repo = {
    async listHabits(userId) {
      const rows = await db.select().from(t.habits).where(eq(t.habits.userId, userId)).orderBy(asc(t.habits.sortOrder));
      return rows.map(toHabit);
    },

    async createHabit(userId, input) {
      const existing = await db.select({ id: t.habits.id }).from(t.habits).where(eq(t.habits.userId, userId));
      const [row] = await db
        .insert(t.habits)
        .values({ ...input, userId, unit: input.unit ?? null, sortOrder: existing.length })
        .returning();
      return toHabit(row);
    },

    async updateHabit(userId, id, patch) {
      await db
        .update(t.habits)
        .set({ ...patch, updatedAt: new Date() })
        .where(and(eq(t.habits.id, id), eq(t.habits.userId, userId)));
    },

    async listEntries(userId, range) {
      const conds = [eq(t.entries.userId, userId)];
      if (range?.from) conds.push(gte(t.entries.localDate, range.from));
      if (range?.to) conds.push(lte(t.entries.localDate, range.to));
      return (await db.select().from(t.entries).where(and(...conds))).map(toEntry);
    },

    async insertEntry(userId, input) {
      const [created] = await db
        .insert(t.entries)
        .values({
          ...input,
          userId,
          note: input.note ?? null,
          rawInput: input.rawInput ?? null,
        })
        .onConflictDoNothing({ target: [t.entries.userId, t.entries.clientId] })
        .returning();
      if (created) return { entry: toEntry(created), duplicate: false };
      const [existing] = await db
        .select()
        .from(t.entries)
        .where(and(eq(t.entries.userId, userId), eq(t.entries.clientId, input.clientId)));
      return { entry: toEntry(existing), duplicate: true };
    },

    async deleteEntries(userId, ids) {
      if (!ids.length) return;
      await db.delete(t.entries).where(and(eq(t.entries.userId, userId), inArray(t.entries.id, ids)));
    },

    async listGoals(userId) {
      const goals = await db.select().from(t.goals).where(eq(t.goals.userId, userId));
      const links = await db.select().from(t.goalLinks).where(eq(t.goalLinks.userId, userId));
      return goals.map<ServerGoal>((g) => ({
        id: g.id,
        title: g.title,
        kind: g.kind,
        targetValue: g.targetValue,
        unit: g.unit ?? undefined,
        periodStart: g.periodStart,
        periodEnd: g.periodEnd,
        status: g.status,
        links: links.filter((l) => l.goalId === g.id).map((l) => ({ habitId: l.habitId, weight: l.weight })),
      }));
    },

    async setGoalStatus(userId, id, status) {
      await db
        .update(t.goals)
        .set({ status, completedAt: status === "completed" ? new Date() : null, updatedAt: new Date() })
        .where(and(eq(t.goals.id, id), eq(t.goals.userId, userId)));
    },

    async upsertHabit(userId, habit) {
      const values = { ...habit, userId, unit: habit.unit ?? null };
      const set: Partial<typeof values> = { ...values };
      delete set.id;
      delete set.userId;
      await db
        .insert(t.habits)
        .values(values)
        .onConflictDoUpdate({ target: t.habits.id, set: { ...set, updatedAt: new Date() }, setWhere: eq(t.habits.userId, userId) });
    },

    async deleteHabits(userId, ids) {
      if (!ids.length) return;
      await db.delete(t.habits).where(and(eq(t.habits.userId, userId), inArray(t.habits.id, ids)));
    },

    async upsertGoal(userId, goal) {
      const { links, ...g } = goal;
      const values = { ...g, userId, unit: g.unit ?? null };
      const set: Partial<typeof values> = { ...values };
      delete set.id;
      delete set.userId;
      const [row] = await db
        .insert(t.goals)
        .values(values)
        .onConflictDoUpdate({ target: t.goals.id, set: { ...set, updatedAt: new Date() }, setWhere: eq(t.goals.userId, userId) })
        .returning({ id: t.goals.id });
      if (!row) return; // el id pertenece a otro usuario
      await db.delete(t.goalLinks).where(and(eq(t.goalLinks.goalId, goal.id), eq(t.goalLinks.userId, userId)));
      if (links.length) {
        await db.insert(t.goalLinks).values(links.map((l) => ({ goalId: goal.id, habitId: l.habitId, weight: l.weight, userId })));
      }
    },

    async deleteGoals(userId, ids) {
      if (!ids.length) return;
      await db.delete(t.goals).where(and(eq(t.goals.userId, userId), inArray(t.goals.id, ids)));
    },

    async getSettings(userId) {
      const [row] = await db.select().from(t.userSettings).where(eq(t.userSettings.userId, userId));
      return row ? toSettings(row) : { ...DEFAULT_SERVER_SETTINGS };
    },

    async updateSettings(userId, patch) {
      const { displayNameUpdatedAt, ...rest } = patch;
      const values = {
        ...rest,
        telegramChatId: patch.telegramChatId ?? undefined,
        ...(displayNameUpdatedAt !== undefined ? { displayNameUpdatedAt: new Date(displayNameUpdatedAt) } : {}),
        updatedAt: new Date(),
      };
      await db
        .insert(t.userSettings)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: t.userSettings.userId, set: values });
    },

    async createToken(userId, name, tokenHash) {
      const [row] = await db.insert(t.apiTokens).values({ userId, name, tokenHash }).returning({ id: t.apiTokens.id });
      return row;
    },

    async findToken(tokenHash) {
      const [row] = await db
        .select({ id: t.apiTokens.id, userId: t.apiTokens.userId })
        .from(t.apiTokens)
        .where(and(eq(t.apiTokens.tokenHash, tokenHash), isNull(t.apiTokens.revokedAt)));
      return row ?? null;
    },

    async touchToken(id) {
      await db.update(t.apiTokens).set({ lastUsedAt: new Date() }).where(eq(t.apiTokens.id, id));
    },

    async listTokens(userId) {
      return db
        .select({
          id: t.apiTokens.id,
          name: t.apiTokens.name,
          lastUsedAt: t.apiTokens.lastUsedAt,
          revokedAt: t.apiTokens.revokedAt,
          createdAt: t.apiTokens.createdAt,
        })
        .from(t.apiTokens)
        .where(eq(t.apiTokens.userId, userId));
    },

    async revokeToken(userId, id) {
      await db
        .update(t.apiTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(t.apiTokens.id, id), eq(t.apiTokens.userId, userId)));
    },

    async createLinkCode(userId, code, expiresAt) {
      await db.insert(t.linkCodes).values({ userId, code, expiresAt });
    },

    async consumeLinkCode(code, chatId, now) {
      const [row] = await db
        .update(t.linkCodes)
        .set({ usedAt: now })
        .where(and(eq(t.linkCodes.code, code), isNull(t.linkCodes.usedAt), gt(t.linkCodes.expiresAt, now)))
        .returning({ userId: t.linkCodes.userId });
      if (!row) return null;
      // Un chat pertenece a una sola cuenta (índice único): se desvincula de la anterior.
      await db
        .update(t.userSettings)
        .set({ telegramChatId: null, remindersEnabled: false, updatedAt: new Date() })
        .where(and(eq(t.userSettings.telegramChatId, chatId), ne(t.userSettings.userId, row.userId)));
      await repo.updateSettings(row.userId, { telegramChatId: chatId });
      return row.userId;
    },

    async findUserByChat(chatId) {
      const [row] = await db
        .select({ userId: t.userSettings.userId })
        .from(t.userSettings)
        .where(eq(t.userSettings.telegramChatId, chatId));
      return row?.userId ?? null;
    },

    async listReminderTargets() {
      const rows = await db
        .select()
        .from(t.userSettings)
        .where(and(eq(t.userSettings.remindersEnabled, true), isNotNull(t.userSettings.telegramChatId)));
      return rows.map((r) => ({
        userId: r.userId,
        chatId: r.telegramChatId!,
        timezone: r.timezone,
        reminderTime: r.reminderTime,
      }));
    },

    async deleteUserData(userId) {
      // Las tablas no tienen FK a auth.users: se borra explícitamente todo lo que tenga user_id, en una transacción.
      await db.transaction(async (tx) => {
        await tx.delete(t.entries).where(eq(t.entries.userId, userId));
        await tx.delete(t.goalLinks).where(eq(t.goalLinks.userId, userId));
        await tx.delete(t.goals).where(eq(t.goals.userId, userId));
        await tx.delete(t.habits).where(eq(t.habits.userId, userId));
        await tx.delete(t.userSettings).where(eq(t.userSettings.userId, userId));
        await tx.delete(t.apiTokens).where(eq(t.apiTokens.userId, userId));
        await tx.delete(t.linkCodes).where(eq(t.linkCodes.userId, userId));
        await tx.delete(t.botPending).where(eq(t.botPending.userId, userId));
      });
    },

    async unlinkTelegram(userId) {
      await db
        .update(t.userSettings)
        .set({ telegramChatId: null, remindersEnabled: false, updatedAt: new Date() })
        .where(eq(t.userSettings.userId, userId));
    },

    async savePending(userId, chatId, payload) {
      const [row] = await db.insert(t.botPending).values({ userId, chatId, payload }).returning({ id: t.botPending.id });
      return row.id;
    },

    async takePending(id, chatId) {
      const [row] = await db
        .delete(t.botPending)
        .where(and(eq(t.botPending.id, id), eq(t.botPending.chatId, chatId)))
        .returning({ userId: t.botPending.userId, payload: t.botPending.payload });
      return row ?? null;
    },

    async purgeStale({ now, pendingBefore }) {
      const codes = await db
        .delete(t.linkCodes)
        .where(or(isNotNull(t.linkCodes.usedAt), lte(t.linkCodes.expiresAt, now)))
        .returning({ id: t.linkCodes.id });
      const pend = await db
        .delete(t.botPending)
        .where(lt(t.botPending.createdAt, pendingBefore))
        .returning({ id: t.botPending.id });
      return { linkCodes: codes.length, pending: pend.length };
    },
  };
  return repo;
}
