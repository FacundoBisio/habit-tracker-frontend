import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Schedule } from "@/lib/domain/types";

const id = () => uuid("id").primaryKey().defaultRandom();
const userId = () => uuid("user_id").notNull();
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const habits = pgTable(
  "habits",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    emoji: text("emoji").notNull().default("✅"),
    color: text("color").notNull().default("emerald"),
    kind: text("kind", { enum: ["boolean", "quantity"] }).notNull().default("boolean"),
    unit: text("unit"),
    defaultAmount: numeric("default_amount", { mode: "number" }).notNull().default(1),
    schedule: jsonb("schedule").$type<Schedule>().notNull().default({ type: "daily" }),
    archived: boolean("archived").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    aliases: text("aliases").array().notNull().default(sql`'{}'::text[]`),
    ...timestamps,
  },
  (t) => [index("habits_user_idx").on(t.userId)],
);

export const entries = pgTable(
  "entries",
  {
    id: id(),
    userId: userId(),
    habitId: uuid("habit_id").notNull().references(() => habits.id, { onDelete: "cascade" }),
    localDate: date("local_date", { mode: "string" }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    amount: numeric("amount", { mode: "number" }).notNull().default(1),
    note: text("note"),
    source: text("source", { enum: ["app", "shortcut", "siri", "bot", "import"] }).notNull().default("app"),
    rawInput: text("raw_input"),
    clientId: uuid("client_id").notNull().defaultRandom(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("entries_client_id_uq").on(t.userId, t.clientId),
    index("entries_user_date_idx").on(t.userId, t.localDate),
    index("entries_habit_date_idx").on(t.habitId, t.localDate),
  ],
);

export const goals = pgTable(
  "goals",
  {
    id: id(),
    userId: userId(),
    title: text("title").notNull(),
    kind: text("kind", { enum: ["count", "sum", "streak", "frequency"] }).notNull(),
    targetValue: numeric("target_value", { mode: "number" }).notNull(),
    unit: text("unit"),
    periodStart: date("period_start", { mode: "string" }).notNull(),
    periodEnd: date("period_end", { mode: "string" }).notNull(),
    status: text("status", { enum: ["active", "completed", "failed", "archived"] }).notNull().default("active"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("goals_user_idx").on(t.userId)],
);

export const goalLinks = pgTable(
  "goal_links",
  {
    id: id(),
    userId: userId(),
    goalId: uuid("goal_id").notNull().references(() => goals.id, { onDelete: "cascade" }),
    habitId: uuid("habit_id").notNull().references(() => habits.id, { onDelete: "cascade" }),
    weight: numeric("weight", { mode: "number" }).notNull().default(1),
    ...timestamps,
  },
  (t) => [uniqueIndex("goal_links_uq").on(t.goalId, t.habitId)],
);

export const userSettings = pgTable("user_settings", {
  id: id(),
  userId: userId().unique(),
  timezone: text("timezone").notNull().default("America/Argentina/Cordoba"),
  weekStartsOn: integer("week_starts_on").notNull().default(1),
  locale: text("locale").notNull().default("es-AR"),
  telegramChatId: text("telegram_chat_id"),
  reminderTime: text("reminder_time").notNull().default("21:00"),
  remindersEnabled: boolean("reminders_enabled").notNull().default(false),
  ...timestamps,
});

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: id(),
    userId: userId(),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("api_tokens_hash_uq").on(t.tokenHash)],
);

export const linkCodes = pgTable("link_codes", {
  id: id(),
  userId: userId(),
  code: text("code").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  ...timestamps,
});

/** Estado pendiente de confirmación del bot (los callbacks de Telegram llegan a otra invocación serverless). */
export const botPending = pgTable("bot_pending", {
  id: id(),
  userId: userId(),
  chatId: text("chat_id").notNull(),
  payload: jsonb("payload").$type<unknown>().notNull(),
  ...timestamps,
});

export const RLS_TABLES = [
  "habits",
  "entries",
  "goals",
  "goal_links",
  "user_settings",
  "api_tokens",
  "link_codes",
  "bot_pending",
] as const;
