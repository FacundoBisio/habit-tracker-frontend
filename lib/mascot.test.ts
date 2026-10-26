import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVITY_MS, activityFor, getActivityOverride, playActivity, resetActivity } from "./mascot";

describe("actividad del personaje", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    resetActivity();
    vi.useRealTimers();
  });

  it("mapea el ícono del hábito a una actividad", () => {
    expect(activityFor("dumbbell")).toBe("lift");
    expect(activityFor("droplets")).toBe("drink");
    expect(activityFor("book-open")).toBe("read");
    expect(activityFor("footprints")).toBe("run");
    expect(activityFor("moon")).toBe("sleep");
    expect(activityFor("music")).toBe("dance");
    expect(activityFor("💧")).toBe("drink"); // emoji viejo
    expect(activityFor("sparkles")).toBe("wave");
  });

  it("al tocar, hace la actividad 10 segundos y después vuelve al estado por defecto", () => {
    expect(getActivityOverride()).toBeNull();
    playActivity("lift");
    expect(getActivityOverride()).toBe("lift");
    vi.advanceTimersByTime(ACTIVITY_MS - 100);
    expect(getActivityOverride()).toBe("lift");
    vi.advanceTimersByTime(200);
    expect(getActivityOverride()).toBeNull();
  });

  it("un toque nuevo reemplaza al anterior y reinicia el tiempo", () => {
    playActivity("lift");
    vi.advanceTimersByTime(8000);
    playActivity("drink");
    expect(getActivityOverride()).toBe("drink");
    vi.advanceTimersByTime(8000);
    expect(getActivityOverride()).toBe("drink");
    vi.advanceTimersByTime(2100);
    expect(getActivityOverride()).toBeNull();
  });
});
