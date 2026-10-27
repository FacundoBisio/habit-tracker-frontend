import {
  DEFAULT_SERVER_SETTINGS,
  type NewEntry,
  type NewHabit,
  type Repo,
  type ServerEntry,
  type ServerGoal,
  type ServerHabit,
  type ServerSettings,
} from "./repo";

/** Implementación en memoria para tests (y para desarrollar sin base de datos). */
export function createMemoryRepo(seed?: { goals?: (ServerGoal & { userId: string })[] }) {
  const habits: (ServerHabit & { userId: string })[] = [];
  const entries: (ServerEntry & { userId: string })[] = [];
  const goals: (ServerGoal & { userId: string })[] = seed?.goals ?? [];
  const settings = new Map<string, ServerSettings>();
  const reminderDays = new Map<string, string>();
  const tokens: { id: string; userId: string; name: string; hash: string; lastUsedAt: Date | null; revokedAt: Date | null; createdAt: Date }[] = [];
  const codes: { userId: string; code: string; expiresAt: Date; usedAt?: Date }[] = [];
  const pending = new Map<string, { userId: string; chatId: string; payload: unknown; createdAt: Date }>();
  let seq = 0;
  const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

  const putHabit = (userId: string, habit: ServerHabit) => {
    const i = habits.findIndex((h) => h.id === habit.id);
    if (i === -1) habits.push({ ...habit, userId });
    else if (habits[i].userId === userId) habits[i] = { ...habit, userId };
  };
  const putGoal = (userId: string, goal: ServerGoal) => {
    const i = goals.findIndex((g) => g.id === goal.id);
    if (i === -1) goals.push({ ...goal, userId });
    else if (goals[i].userId === userId) goals[i] = { ...goal, userId };
  };

  const repo: Repo = {
    async listHabits(userId) {
      return habits.filter((h) => h.userId === userId).sort((a, b) => a.sortOrder - b.sortOrder);
    },
    async createHabit(userId, input: NewHabit) {
      const habit = { ...input, id: input.id ?? id(), archived: false, sortOrder: habits.length, userId };
      habits.push(habit);
      return habit;
    },
    async updateHabit(userId, hid, patch) {
      const h = habits.find((x) => x.id === hid && x.userId === userId);
      if (h) Object.assign(h, patch);
    },
    async listEntries(userId, range) {
      return entries.filter(
        (e) => e.userId === userId && (!range?.from || e.localDate >= range.from) && (!range?.to || e.localDate <= range.to),
      );
    },
    async insertEntry(userId, input: NewEntry) {
      const dup = entries.find((e) => e.userId === userId && e.clientId === input.clientId);
      if (dup) return { entry: dup, duplicate: true };
      const entry = { ...input, id: input.id ?? id(), userId };
      entries.push(entry);
      return { entry, duplicate: false };
    },
    async deleteEntries(userId, ids) {
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].userId === userId && ids.includes(entries[i].id)) entries.splice(i, 1);
      }
    },
    async listGoals(userId) {
      return goals.filter((g) => g.userId === userId);
    },
    async setGoalStatus(userId, gid, status) {
      const g = goals.find((x) => x.id === gid && x.userId === userId);
      if (g) g.status = status;
    },
    async upsertHabit(userId, habit) {
      putHabit(userId, habit);
    },
    async upsertHabits(userId, list) {
      for (const h of list) putHabit(userId, h);
    },
    async deleteHabits(userId, ids) {
      for (let i = habits.length - 1; i >= 0; i--) {
        if (habits[i].userId === userId && ids.includes(habits[i].id)) habits.splice(i, 1);
      }
      for (let i = entries.length - 1; i >= 0; i--) {
        if (entries[i].userId === userId && ids.includes(entries[i].habitId)) entries.splice(i, 1);
      }
    },
    async upsertGoal(userId, goal) {
      putGoal(userId, goal);
    },
    async upsertGoals(userId, list) {
      for (const g of list) putGoal(userId, g);
    },
    async insertEntries(userId, list) {
      const stored: string[] = [];
      const byClient = new Set(entries.filter((e) => e.userId === userId).map((e) => e.clientId));
      const ids = new Set(entries.map((e) => e.id));
      for (const input of list) {
        if (byClient.has(input.clientId)) {
          stored.push(input.clientId);
          continue;
        }
        const entry = { ...input, id: input.id ?? id(), userId };
        if (ids.has(entry.id)) continue; // el id ya lo usa otra fila: no se guarda
        entries.push(entry);
        byClient.add(entry.clientId);
        ids.add(entry.id);
        stored.push(entry.clientId);
      }
      return stored;
    },
    async transaction(fn) {
      // Copia de lo que toca la sincronización; si `fn` falla se restaura.
      const snap = structuredClone({ habits, entries, goals, settings: [...settings] });
      try {
        return await fn(repo);
      } catch (err) {
        habits.splice(0, habits.length, ...snap.habits);
        entries.splice(0, entries.length, ...snap.entries);
        goals.splice(0, goals.length, ...snap.goals);
        settings.clear();
        for (const [k, v] of snap.settings) settings.set(k, v);
        throw err;
      }
    },
    async deleteGoals(userId, ids) {
      for (let i = goals.length - 1; i >= 0; i--) {
        if (goals[i].userId === userId && ids.includes(goals[i].id)) goals.splice(i, 1);
      }
    },
    async getSettings(userId) {
      return settings.get(userId) ?? { ...DEFAULT_SERVER_SETTINGS };
    },
    async updateSettings(userId, patch) {
      settings.set(userId, { ...(settings.get(userId) ?? DEFAULT_SERVER_SETTINGS), ...patch });
    },
    async createToken(userId, name, hash) {
      const t = { id: id(), userId, name, hash, lastUsedAt: null, revokedAt: null, createdAt: new Date() };
      tokens.push(t);
      return { id: t.id };
    },
    async findToken(hash) {
      const t = tokens.find((x) => x.hash === hash && !x.revokedAt);
      return t ? { id: t.id, userId: t.userId } : null;
    },
    async touchToken(tid) {
      const t = tokens.find((x) => x.id === tid);
      if (t) t.lastUsedAt = new Date();
    },
    async listTokens(userId) {
      return tokens.filter((t) => t.userId === userId);
    },
    async revokeToken(userId, tid) {
      const t = tokens.find((x) => x.id === tid && x.userId === userId);
      if (t) t.revokedAt = new Date();
    },
    async createLinkCode(userId, code, expiresAt) {
      codes.push({ userId, code, expiresAt });
    },
    async consumeLinkCode(code, chatId, now) {
      const c = codes.find((x) => x.code === code && !x.usedAt && x.expiresAt > now);
      if (!c) return null;
      c.usedAt = now;
      // Un chat pertenece a una sola cuenta: se desvincula de la anterior.
      for (const [uid, st] of settings) {
        if (uid !== c.userId && st.telegramChatId === chatId) settings.set(uid, { ...st, telegramChatId: undefined, remindersEnabled: false });
      }
      await repo.updateSettings(c.userId, { telegramChatId: chatId });
      return c.userId;
    },
    async findUserByChat(chatId) {
      for (const [userId, s] of settings) if (s.telegramChatId === chatId) return userId;
      return null;
    },
    async listReminderTargets() {
      return [...settings]
        .filter(([, s]) => s.remindersEnabled && s.telegramChatId)
        .map(([userId, s]) => ({ userId, chatId: s.telegramChatId!, timezone: s.timezone, reminderTime: s.reminderTime }));
    },
    async claimReminder(userId, today) {
      const last = reminderDays.get(userId);
      if (last && last >= today) return false;
      reminderDays.set(userId, today);
      return true;
    },
    async savePending(userId, chatId, payload) {
      const pid = id();
      pending.set(pid, { userId, chatId, payload, createdAt: new Date() });
      return pid;
    },
    async takePending(pid, chatId) {
      const p = pending.get(pid);
      if (!p || p.chatId !== chatId) return null;
      pending.delete(pid);
      return { userId: p.userId, payload: p.payload };
    },
    async purgeStale({ now, pendingBefore }) {
      let linkCodes = 0;
      for (let i = codes.length - 1; i >= 0; i--) {
        if (codes[i].usedAt || codes[i].expiresAt <= now) {
          codes.splice(i, 1);
          linkCodes++;
        }
      }
      let purged = 0;
      for (const [pid, p] of pending) {
        if (p.createdAt < pendingBefore) {
          pending.delete(pid);
          purged++;
        }
      }
      return { linkCodes, pending: purged };
    },
    async deleteUserData(userId) {
      const drop = <T extends { userId: string }>(list: T[]) => {
        for (let i = list.length - 1; i >= 0; i--) if (list[i].userId === userId) list.splice(i, 1);
      };
      drop(entries);
      drop(goals);
      drop(habits);
      drop(tokens);
      drop(codes);
      settings.delete(userId);
      for (const [k, p] of pending) if (p.userId === userId) pending.delete(k);
    },
    async unlinkTelegram(userId) {
      const s = settings.get(userId);
      if (s) settings.set(userId, { ...s, telegramChatId: undefined, remindersEnabled: false });
    },
  };
  return repo;
}
