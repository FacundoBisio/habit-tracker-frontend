import { addDays, toLocalDate } from "@/lib/domain/dates";
import { normalize } from "@/lib/domain/match";
import { resolveItems, type NLParser } from "@/lib/nl/types";
import type { Repo, ServerHabit } from "@/lib/server/repo";
import { deterministicUuid } from "@/lib/server/security";
import { fmtNum, impactSummary, refreshGoals } from "@/lib/server/service";
import type { InlineButton, ReplyMarkup, TelegramClient, TelegramUpdate } from "./api";
import { goalsText, HELP, todayText, UNLINKED, weekText } from "./texts";
import { glyph } from "@/lib/habit-icons";

export interface BotDeps {
  repo: Repo;
  parser: NLParser;
  tg: TelegramClient;
  now: () => Date;
  /** Freno a intentos de /vincular por chat (fuerza bruta de códigos). */
  linkLimiter?: (key: string) => { ok: true } | { ok: false; retryAfterSec: number };
}

interface PendingItem {
  habitId: string;
  amount: number;
  localDate: string;
  note?: string;
}
interface PendingPayload {
  rawInput: string;
  /** update_id del mensaje original: si Telegram reintenta y quedan dos pendientes, confirmar ambas no duplica. */
  updateId?: number;
  resolved: PendingItem[];
  unmatched: { term: string; amount: number; localDate: string }[];
}

const MAX_ALIAS_BUTTONS = 6;

export async function handleUpdate(update: TelegramUpdate, deps: BotDeps): Promise<void> {
  if (update.callback_query?.message) {
    const cq = update.callback_query;
    await handleCallback(String(cq.message!.chat.id), cq.message!.message_id, cq.id, cq.data ?? "", deps);
  } else if (update.message?.text) {
    await handleText(String(update.message.chat.id), update.message.text.trim(), deps, update.update_id);
  }
}

/**
 * client_id de un registro del bot. Con `update_id` es determinístico: si Telegram reintenta el
 * webhook (timeout, 5xx) el mismo update no registra dos veces. Sin él, uno aleatorio.
 */
const botClientId = (updateId: number | undefined, i = 0) =>
  updateId === undefined ? crypto.randomUUID() : deterministicUuid(`tg|${updateId}|${i}`);

// ---------- Texto ----------

async function handleText(chatId: string, text: string, deps: BotDeps, updateId?: number) {
  const { repo, tg } = deps;
  const cmd = /^\/(\w+)(?:@\w+)?\s*([\s\S]*)$/.exec(text);
  const userId = await repo.findUserByChat(chatId);

  if (cmd?.[1] === "start") {
    await tg.sendMessage(chatId, userId ? `¡Hola de nuevo! 👋\n\n${HELP}` : `¡Hola! 👋\n\n${UNLINKED}`);
    if (userId) await sendKeyboard(chatId, userId, deps);
    return;
  }

  if (cmd?.[1] === "vincular") {
    const code = cmd[2].trim().toUpperCase();
    const limit = deps.linkLimiter?.(chatId);
    if (limit && !limit.ok) return tg.sendMessage(chatId, "Demasiados intentos. Probá en un minuto.");
    if (!code) return tg.sendMessage(chatId, "Usá: /vincular CÓDIGO (lo generás en la app → Ajustes).");
    const linked = await repo.consumeLinkCode(code, chatId, deps.now());
    if (!linked) return tg.sendMessage(chatId, "Código inválido o vencido. Generá uno nuevo en la app.");
    await tg.sendMessage(chatId, `✅ Cuenta vinculada.\n\n${HELP}`);
    await sendKeyboard(chatId, linked, deps);
    return;
  }

  if (!userId) return tg.sendMessage(chatId, UNLINKED);

  const now = deps.now();
  const settings = await repo.getSettings(userId);
  const today = toLocalDate(now, settings.timezone);

  if (cmd) {
    switch (cmd[1]) {
      case "hoy": {
        const [habits, entries] = await Promise.all([repo.listHabits(userId), repo.listEntries(userId)]);
        return tg.sendMessage(chatId, todayText(habits, entries, today, settings));
      }
      case "semana": {
        const [habits, entries] = await Promise.all([repo.listHabits(userId), repo.listEntries(userId)]);
        return tg.sendMessage(chatId, weekText(habits, entries, today, settings));
      }
      case "objetivos": {
        const [goals, entries] = await Promise.all([repo.listGoals(userId), repo.listEntries(userId)]);
        return tg.sendMessage(chatId, goalsText(goals, entries, today, settings));
      }
      case "deshacer":
        return undoLast(chatId, userId, deps, settings, today);
      case "recordatorios":
        return handleReminders(chatId, userId, cmd[2].trim().toLowerCase(), deps);
      case "teclado":
        return sendKeyboard(chatId, userId, deps);
      case "ayuda":
      case "help":
        return tg.sendMessage(chatId, HELP);
      default:
        return tg.sendMessage(chatId, `No conozco ese comando.\n\n${HELP}`);
    }
  }

  const habits = (await repo.listHabits(userId)).filter((h) => !h.archived);
  if (!habits.length) return tg.sendMessage(chatId, "Todavía no tenés hábitos. Creá el primero en la app.");

  // Un toque desde el teclado de respuesta: nombre o alias exacto → registro directo con deshacer.
  const q = normalize(text);
  const exact = habits.filter((h) => [h.name, ...h.aliases].map(normalize).includes(q));
  if (exact.length === 1) return logDirect(chatId, userId, exact[0], deps, settings, today, updateId);

  const parsed = await deps.parser.parse(text, { habits, today, timezone: settings.timezone });
  const { resolved, unmatched } = resolveItems(parsed, habits);
  if (!resolved.length && !unmatched.length) {
    return tg.sendMessage(chatId, `No entendí qué registrar. 🤔\n\n${HELP}`);
  }
  await presentPending(
    chatId,
    userId,
    {
      rawInput: text,
      updateId,
      resolved: resolved.map((r) => ({ habitId: r.habit.id, amount: r.amount, localDate: r.localDate, note: r.note })),
      unmatched,
    },
    habits,
    today,
    deps,
  );
}

async function logDirect(
  chatId: string,
  userId: string,
  habit: ServerHabit,
  deps: BotDeps,
  settings: Awaited<ReturnType<Repo["getSettings"]>>,
  today: string,
  updateId?: number,
) {
  const now = deps.now();
  const { entry } = await deps.repo.insertEntry(userId, {
    habitId: habit.id,
    amount: habit.defaultAmount,
    localDate: today,
    occurredAt: now,
    source: "bot",
    rawInput: habit.name,
    clientId: botClientId(updateId),
  });
  const completed = await refreshGoals(deps.repo, userId, settings, today);
  const text = await impactSummary(deps.repo, userId, habit, habit.defaultAmount, now, completed);
  await deps.tg.sendMessage(chatId, text, { inline_keyboard: [[{ text: "↩️ Deshacer", callback_data: `undo:${entry.id}` }]] });
}

const dateLabel = (date: string, today: string) => {
  if (date === today) return "";
  if (date === addDays(today, -1)) return " (ayer)";
  const [, m, d] = date.split("-");
  return ` (${Number(d)}/${Number(m)})`;
};

async function presentPending(
  chatId: string,
  userId: string,
  payload: PendingPayload,
  habits: ServerHabit[],
  today: string,
  deps: BotDeps,
) {
  const byId = new Map(habits.map((h) => [h.id, h]));
  const lines = payload.resolved.map((r) => {
    const h = byId.get(r.habitId)!;
    return `• ${glyph(h.emoji)} ${h.name}${h.kind === "quantity" ? ` +${fmtNum(r.amount)}${h.unit ? ` ${h.unit}` : ""}` : ""}${dateLabel(r.localDate, today)}`;
  });
  const first = payload.unmatched[0];
  const extra = payload.unmatched.map((u) => `• ❓ “${u.term}” no coincide con ningún hábito`);

  const id = await deps.repo.savePending(userId, chatId, payload);
  const keyboard: InlineButton[][] = [];
  if (payload.resolved.length) keyboard.push([{ text: "✅ Confirmar", callback_data: `ok:${id}` }]);
  if (first) {
    keyboard.push([{ text: `➕ Crear “${first.term}”`.slice(0, 40), callback_data: `new:${id}` }]);
    habits.slice(0, MAX_ALIAS_BUTTONS).forEach((h, i) => {
      keyboard.push([{ text: `🔗 “${first.term}” es ${h.name}`.slice(0, 40), callback_data: `al:${id}:${i}` }]);
    });
  }
  keyboard.push([
    { text: "✏️ Corregir", callback_data: `fix:${id}` },
    { text: "❌ Cancelar", callback_data: `no:${id}` },
  ]);

  const head = payload.resolved.length ? "Entendí:" : "No encontré hábitos para:";
  const tail = payload.resolved.length && !first ? "\n¿Lo registro?" : first ? "\nResolvé lo que no coincide:" : "";
  await deps.tg.sendMessage(chatId, [head, ...lines, ...extra].join("\n") + tail, { inline_keyboard: keyboard });
}

// ---------- Callbacks ----------

async function handleCallback(chatId: string, messageId: number, callbackId: string, data: string, deps: BotDeps) {
  const { repo, tg } = deps;
  const userId = await repo.findUserByChat(chatId);
  if (!userId) {
    await tg.answerCallback(callbackId, "Cuenta no vinculada");
    return;
  }
  const [action, id, extra] = data.split(":");
  const now = deps.now();
  const settings = await repo.getSettings(userId);
  const today = toLocalDate(now, settings.timezone);

  if (action === "undo") {
    const entries = await repo.listEntries(userId);
    if (entries.some((e) => e.id === id)) {
      await repo.deleteEntries(userId, [id]);
      await refreshGoals(deps.repo, userId, settings, today);
      await tg.editMessage(chatId, messageId, "↩️ Registro deshecho.");
      await tg.answerCallback(callbackId, "Deshecho");
    } else {
      await tg.answerCallback(callbackId, "Ya estaba deshecho");
    }
    return;
  }

  const pending = await repo.takePending(id, chatId);
  if (!pending || pending.userId !== userId) {
    await tg.answerCallback(callbackId, "Esta confirmación ya no está disponible");
    return;
  }
  const payload = pending.payload as PendingPayload;
  const habits = (await repo.listHabits(userId)).filter((h) => !h.archived);

  switch (action) {
    case "no":
      await tg.editMessage(chatId, messageId, "❌ Cancelado.");
      return tg.answerCallback(callbackId);

    case "fix":
      await tg.editMessage(chatId, messageId, "✏️ Dale, escribilo de nuevo como quieras que lo registre.");
      return tg.answerCallback(callbackId);

    case "ok": {
      const lines: string[] = [];
      const touched = new Map<string, number>();
      for (const [i, item] of payload.resolved.entries()) {
        const habit = habits.find((h) => h.id === item.habitId);
        if (!habit) continue;
        // client_id determinístico: un doble toque en "Confirmar" no duplica, y si el mensaje
        // original llegó dos veces (reintento del webhook) confirmar ambas pendientes tampoco.
        await repo.insertEntry(userId, {
          habitId: habit.id,
          amount: item.amount,
          localDate: item.localDate,
          occurredAt: now,
          note: item.note,
          source: "bot",
          rawInput: payload.rawInput,
          clientId: payload.updateId === undefined ? deterministicUuid(`${id}|${i}`) : botClientId(payload.updateId, i),
        });
        touched.set(habit.id, (touched.get(habit.id) ?? 0) + item.amount);
      }
      const completed = await refreshGoals(repo, userId, settings, today);
      for (const [habitId, amount] of touched) {
        const habit = habits.find((h) => h.id === habitId)!;
        lines.push(await impactSummary(repo, userId, habit, amount, now, []));
      }
      for (const t of completed) lines.push(`🎉 Objetivo completado: ${t}`);
      await tg.editMessage(chatId, messageId, lines.join("\n") || "Nada para registrar.");
      return tg.answerCallback(callbackId, "Registrado");
    }

    case "new": {
      const [first, ...rest] = payload.unmatched;
      if (!first) return tg.answerCallback(callbackId);
      const qty = first.amount !== 1;
      const habit = await repo.createHabit(userId, {
        name: first.term.charAt(0).toUpperCase() + first.term.slice(1),
        emoji: "sparkles",
        color: "teal",
        kind: qty ? "quantity" : "boolean",
        defaultAmount: qty ? first.amount : 1,
        schedule: { type: "daily" },
        aliases: [],
      });
      await tg.answerCallback(callbackId, `Hábito “${habit.name}” creado`);
      return continuePending(chatId, userId, messageId, payload, rest, { habitId: habit.id, amount: first.amount, localDate: first.localDate }, deps, today);
    }

    case "al": {
      const [first, ...rest] = payload.unmatched;
      const target = habits[Number(extra)];
      if (!first || !target) return tg.answerCallback(callbackId);
      await repo.updateHabit(userId, target.id, { aliases: [...new Set([...target.aliases, normalize(first.term)])] });
      await tg.answerCallback(callbackId, `Alias guardado: ${first.term} → ${target.name}`);
      return continuePending(chatId, userId, messageId, payload, rest, { habitId: target.id, amount: first.amount, localDate: first.localDate }, deps, today);
    }
  }
}

async function continuePending(
  chatId: string,
  userId: string,
  messageId: number,
  payload: PendingPayload,
  rest: PendingPayload["unmatched"],
  added: PendingItem,
  deps: BotDeps,
  today: string,
) {
  const habits = (await deps.repo.listHabits(userId)).filter((h) => !h.archived);
  await deps.tg.editMessage(chatId, messageId, "👌 Listo, sigo con el resto…");
  await presentPending(chatId, userId, { ...payload, resolved: [...payload.resolved, added], unmatched: rest }, habits, today, deps);
}

// ---------- Comandos ----------

/** Deshace el último registro; si vino de un mensaje con varios ítems, deshace todo el lote. */
async function undoLast(chatId: string, userId: string, deps: BotDeps, settings: Awaited<ReturnType<Repo["getSettings"]>>, today: string) {
  const entries = (await deps.repo.listEntries(userId)).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const last = entries[0];
  if (!last) return deps.tg.sendMessage(chatId, "No hay nada para deshacer.");
  const batch = last.rawInput
    ? entries.filter((e) => e.rawInput === last.rawInput && e.occurredAt.getTime() === last.occurredAt.getTime())
    : [last];
  await deps.repo.deleteEntries(userId, batch.map((e) => e.id));
  await refreshGoals(deps.repo, userId, settings, today);
  await deps.tg.sendMessage(chatId, `↩️ Deshice ${batch.length} registro${batch.length === 1 ? "" : "s"}.`);
}

async function handleReminders(chatId: string, userId: string, arg: string, deps: BotDeps) {
  const { repo, tg } = deps;
  if (arg === "on" || arg === "off") {
    await repo.updateSettings(userId, { remindersEnabled: arg === "on" });
  } else if (/^([01]?\d|2[0-3]):[0-5]\d$/.test(arg)) {
    const [h, m] = arg.split(":");
    await repo.updateSettings(userId, { reminderTime: `${h.padStart(2, "0")}:${m}`, remindersEnabled: true });
  } else if (arg) {
    return tg.sendMessage(chatId, "Usá: /recordatorios on, /recordatorios off o /recordatorios 21:30");
  }
  const s = await repo.getSettings(userId);
  await tg.sendMessage(
    chatId,
    s.remindersEnabled
      ? `🔔 Recordatorio diario a las ${s.reminderTime} (${s.timezone}). Los domingos también te mando el resumen.\nCambiá con /recordatorios 21:30 o apagá con /recordatorios off.`
      : "🔕 Recordatorios apagados. Activalos con /recordatorios on o /recordatorios 21:30.",
  );
}

/** Teclado de respuesta con los hábitos más usados (últimos 30 días) para registrar en 1 toque. */
async function sendKeyboard(chatId: string, userId: string, deps: BotDeps) {
  const [habits, entries, settings] = await Promise.all([
    deps.repo.listHabits(userId),
    deps.repo.listEntries(userId),
    deps.repo.getSettings(userId),
  ]);
  const from = addDays(toLocalDate(deps.now(), settings.timezone), -30);
  const uses = new Map<string, number>();
  for (const e of entries) if (e.localDate >= from) uses.set(e.habitId, (uses.get(e.habitId) ?? 0) + 1);
  const top = habits
    .filter((h) => !h.archived)
    .sort((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0) || a.sortOrder - b.sortOrder)
    .slice(0, 6);
  if (!top.length) return;
  const rows: { text: string }[][] = [];
  for (let i = 0; i < top.length; i += 2) rows.push(top.slice(i, i + 2).map((h) => ({ text: h.name })));
  const markup: ReplyMarkup = { keyboard: rows, resize_keyboard: true, is_persistent: true };
  await deps.tg.sendMessage(chatId, "Teclado listo: tocá un hábito para registrarlo.", markup);
}
