import type { GoalKind, GoalLink, LocalDate, Schedule, WeekStart } from "@/lib/domain/types";

export type EntrySource = "app" | "shortcut" | "siri" | "bot" | "import";

export interface ServerHabit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  kind: "boolean" | "quantity";
  unit?: string;
  defaultAmount: number;
  schedule: Schedule;
  archived: boolean;
  sortOrder: number;
  aliases: string[];
}

export interface ServerEntry {
  id: string;
  habitId: string;
  localDate: LocalDate;
  occurredAt: Date;
  amount: number;
  note?: string;
  source: EntrySource;
  rawInput?: string;
  clientId: string;
}

export interface ServerGoal {
  id: string;
  title: string;
  kind: GoalKind;
  targetValue: number;
  unit?: string;
  periodStart: LocalDate;
  periodEnd: LocalDate;
  status: "active" | "completed" | "failed" | "archived";
  links: GoalLink[];
}

export interface ServerSettings {
  timezone: string;
  weekStartsOn: WeekStart;
  telegramChatId?: string;
  reminderTime: string; // HH:MM hora local
  remindersEnabled: boolean;
}

export const DEFAULT_SERVER_SETTINGS: ServerSettings = {
  timezone: "America/Argentina/Cordoba",
  weekStartsOn: 1,
  reminderTime: "21:00",
  remindersEnabled: false,
};

export type NewHabit = Omit<ServerHabit, "id" | "archived" | "sortOrder"> & { id?: string };
export type NewEntry = Omit<ServerEntry, "id"> & { id?: string };

export interface ReminderTarget {
  userId: string;
  chatId: string;
  timezone: string;
  reminderTime: string;
}

/**
 * Acceso a datos. TODA operación recibe `userId`: nunca se confía en un id del cliente.
 * Implementaciones: `memoryRepo` (tests) y `drizzleRepo` (producción).
 */
export interface Repo {
  listHabits(userId: string): Promise<ServerHabit[]>;
  createHabit(userId: string, input: NewHabit): Promise<ServerHabit>;
  updateHabit(userId: string, id: string, patch: Partial<Omit<ServerHabit, "id">>): Promise<void>;

  listEntries(userId: string, range?: { from?: LocalDate; to?: LocalDate }): Promise<ServerEntry[]>;
  /** Idempotente por (userId, clientId): si ya existe devuelve la existente con `duplicate: true`. */
  insertEntry(userId: string, input: NewEntry): Promise<{ entry: ServerEntry; duplicate: boolean }>;
  deleteEntries(userId: string, ids: string[]): Promise<void>;

  listGoals(userId: string): Promise<ServerGoal[]>;
  setGoalStatus(userId: string, id: string, status: ServerGoal["status"]): Promise<void>;

  /** Upsert por id acotado al usuario: un id ajeno nunca se pisa. */
  upsertHabit(userId: string, habit: ServerHabit): Promise<void>;
  deleteHabits(userId: string, ids: string[]): Promise<void>;
  upsertGoal(userId: string, goal: ServerGoal): Promise<void>;
  deleteGoals(userId: string, ids: string[]): Promise<void>;

  getSettings(userId: string): Promise<ServerSettings>;
  updateSettings(userId: string, patch: Partial<ServerSettings>): Promise<void>;

  // Tokens de API (se guarda solo el hash)
  createToken(userId: string, name: string, tokenHash: string): Promise<{ id: string }>;
  findToken(tokenHash: string): Promise<{ id: string; userId: string } | null>;
  touchToken(id: string): Promise<void>;
  listTokens(userId: string): Promise<{ id: string; name: string; lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date }[]>;
  revokeToken(userId: string, id: string): Promise<void>;

  // Telegram
  createLinkCode(userId: string, code: string, expiresAt: Date): Promise<void>;
  /** Consume el código (un solo uso, con vencimiento) y vincula el chat. Devuelve el userId o null. */
  consumeLinkCode(code: string, chatId: string, now: Date): Promise<string | null>;
  findUserByChat(chatId: string): Promise<string | null>;
  listReminderTargets(): Promise<ReminderTarget[]>;

  // Confirmaciones pendientes del bot
  savePending(userId: string, chatId: string, payload: unknown): Promise<string>;
  takePending(id: string, chatId: string): Promise<{ userId: string; payload: unknown } | null>;
}
