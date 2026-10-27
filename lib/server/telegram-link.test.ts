import { describe, expect, it } from "vitest";
import { createMemoryRepo } from "./memory-repo";

describe("vincular un chat de Telegram", () => {
  it("si el chat ya estaba en otra cuenta, se desvincula de esa", async () => {
    const repo = createMemoryRepo();
    const now = new Date("2026-10-27T12:00:00Z");
    const later = new Date(now.getTime() + 600_000);
    await repo.createLinkCode("ana", "AAA111", later);
    await repo.createLinkCode("beto", "BBB222", later);
    await repo.updateSettings("ana", { remindersEnabled: true });

    expect(await repo.consumeLinkCode("AAA111", "chat-1", now)).toBe("ana");
    expect(await repo.consumeLinkCode("BBB222", "chat-1", now)).toBe("beto");

    expect(await repo.findUserByChat("chat-1")).toBe("beto");
    const ana = await repo.getSettings("ana");
    expect(ana.telegramChatId).toBeUndefined();
    expect(ana.remindersEnabled).toBe(false);
  });
});
