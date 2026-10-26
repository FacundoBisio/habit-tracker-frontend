export interface InlineButton {
  text: string;
  callback_data: string;
}

export type ReplyMarkup =
  | { inline_keyboard: InlineButton[][] }
  | { keyboard: { text: string }[][]; resize_keyboard: true; is_persistent: true }
  | { remove_keyboard: true };

export interface TelegramClient {
  sendMessage(chatId: string, text: string, replyMarkup?: ReplyMarkup): Promise<void>;
  editMessage(chatId: string, messageId: number, text: string, replyMarkup?: ReplyMarkup): Promise<void>;
  answerCallback(callbackId: string, text?: string): Promise<void>;
}

export interface TelegramUpdate {
  update_id?: number;
  message?: { message_id: number; chat: { id: number | string }; text?: string };
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number | string } };
  };
}

/** Cliente real de la Bot API (los tests usan uno falso). */
export function createTelegramClient(token: string, doFetch: typeof fetch = fetch): TelegramClient {
  async function call(method: string, body: Record<string, unknown>) {
    const res = await doFetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.warn(`[telegram] ${method} → ${res.status}`);
  }
  return {
    sendMessage: (chat_id, text, reply_markup) => call("sendMessage", { chat_id, text, reply_markup }),
    editMessage: (chat_id, message_id, text, reply_markup) =>
      call("editMessageText", { chat_id, message_id, text, reply_markup }),
    answerCallback: (callback_query_id, text) => call("answerCallbackQuery", { callback_query_id, text }),
  };
}
