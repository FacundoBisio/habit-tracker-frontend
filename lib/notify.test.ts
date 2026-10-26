import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dismiss, FAST_MS, getNoticeState, resetNotices, toast } from "./notify";

describe("cola de avisos", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    resetNotices();
    vi.useRealTimers();
  });

  it("muestra de a un aviso y el resto espera en cola, en orden", () => {
    toast("uno");
    toast("dos");
    toast("tres");
    expect(getNoticeState().current?.text).toBe("uno");
    expect(getNoticeState().waiting).toBe(2);

    dismiss(getNoticeState().current!.id);
    expect(getNoticeState().current?.text).toBe("dos");
    dismiss(getNoticeState().current!.id);
    expect(getNoticeState().current?.text).toBe("tres");
    dismiss(getNoticeState().current!.id);
    expect(getNoticeState().current).toBeNull();
  });

  it("con cola, el aviso actual se acorta para que avance", () => {
    toast("uno", { duration: 10_000 });
    toast("dos");
    vi.advanceTimersByTime(FAST_MS + 100);
    expect(getNoticeState().current?.text).toBe("dos");
  });

  it("sin cola, el aviso dura lo previsto", () => {
    toast("solo", { duration: 4000 });
    vi.advanceTimersByTime(3900);
    expect(getNoticeState().current?.text).toBe("solo");
    vi.advanceTimersByTime(200);
    expect(getNoticeState().current).toBeNull();
  });

  it("la cola tiene tope y descarta los más viejos que esperan", () => {
    for (let i = 0; i < 12; i++) toast(`n${i}`);
    expect(getNoticeState().current?.text).toBe("n0");
    expect(getNoticeState().waiting).toBe(6);
  });

  it("cerrar uno que espera lo saca de la cola", () => {
    toast("uno");
    const waitingId = toast("dos");
    toast("tres");
    dismiss(waitingId);
    expect(getNoticeState().waiting).toBe(1);
    dismiss(getNoticeState().current!.id);
    expect(getNoticeState().current?.text).toBe("tres");
  });
});
