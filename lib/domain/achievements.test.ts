import { describe, expect, it } from "vitest";
import { computeAchievements, countPerfectDays } from "./achievements";
import { addDays } from "./dates";
import type { DomainEntry, Schedule } from "./types";

const TODAY = "2026-03-20";
const daily: Schedule = { type: "daily" };
const run = (habitId: string, days: number, endBack = 0): DomainEntry[] =>
  Array.from({ length: days }, (_, i) => ({ habitId, localDate: addDays(TODAY, -(endBack + i)), amount: 1 }));
const input = (over: Partial<Parameters<typeof computeAchievements>[0]> = {}) => ({
  habits: [{ id: "a", schedule: daily }],
  entries: [] as DomainEntry[],
  goals: [] as { status: string }[],
  today: TODAY,
  weekStartsOn: 1 as const,
  ...over,
});
const get = (list: ReturnType<typeof computeAchievements>, id: string) => list.find((a) => a.id === id)!;

describe("logros", () => {
  it("sin datos no hay nada desbloqueado", () => {
    expect(computeAchievements(input()).some((a) => a.unlocked)).toBe(false);
  });

  it("rachas: 7 días seguidos desbloquea 3 y 7 pero no 14, y muestra el avance", () => {
    const list = computeAchievements(input({ entries: run("a", 7) }));
    expect(get(list, "rachas-3").unlocked).toBe(true);
    expect(get(list, "rachas-7").unlocked).toBe(true);
    const fourteen = get(list, "rachas-14");
    expect(fourteen.unlocked).toBe(false);
    expect(fourteen.value).toBe(7);
    expect(fourteen.target).toBe(14);
  });

  it("un logro de racha se conserva aunque la racha actual se corte", () => {
    // 10 días seguidos que terminaron hace 5 días: racha actual 0, pero la máxima fue 10
    const list = computeAchievements(input({ entries: run("a", 10, 5) }));
    expect(get(list, "rachas-7").unlocked).toBe(true);
  });

  it("los hábitos semanales cuentan semanas, no días", () => {
    const weekly: Schedule = { type: "weekly", times: 2 };
    const weeks = ["2026-03-02", "2026-03-09", "2026-03-16"].flatMap((w) => [
      { habitId: "w", localDate: w, amount: 1 },
      { habitId: "w", localDate: addDays(w, 2), amount: 1 },
    ]);
    const list = computeAchievements(input({ habits: [{ id: "w", schedule: weekly }], entries: weeks }));
    expect(get(list, "constancia-2").unlocked).toBe(true);
    expect(get(list, "constancia-4").unlocked).toBe(false);
    expect(get(list, "rachas-3").unlocked).toBe(false);
  });

  it("registros totales", () => {
    const list = computeAchievements(input({ entries: run("a", 12) }));
    expect(get(list, "registros-1").unlocked).toBe(true);
    expect(get(list, "registros-10").unlocked).toBe(true);
    expect(get(list, "registros-50").unlocked).toBe(false);
  });

  it("objetivos completados", () => {
    const list = computeAchievements(input({ goals: [{ status: "completed" }, { status: "active" }] }));
    expect(get(list, "objetivos-1").unlocked).toBe(true);
    expect(get(list, "objetivos-3").unlocked).toBe(false);
  });
});

describe("días perfectos", () => {
  const habits = [
    { id: "a", schedule: daily },
    { id: "b", schedule: daily },
  ];

  it("solo cuenta los días con todos los hábitos hechos", () => {
    const entries = [...run("a", 3), ...run("b", 2)];
    // hoy y ayer: a y b; anteayer solo a (b ya existía? su primer registro es ayer, así que ese día no exige b)
    expect(countPerfectDays(habits, entries, TODAY)).toBe(3);
  });

  it("si un hábito ya existía y se saltea un día, ese día no es perfecto", () => {
    const entries = [...run("a", 4), ...run("b", 1, 3), ...run("b", 1, 0)];
    // b: hace 3 días y hoy (no hizo hace 2 ni ayer); a: los 4 días
    expect(countPerfectDays(habits, entries, TODAY)).toBe(2);
  });

  it("los semanales no cuentan y sin hábitos diarios da 0", () => {
    expect(countPerfectDays([{ id: "w", schedule: { type: "weekly", times: 3 } }], run("w", 5), TODAY)).toBe(0);
  });

  it("respeta los días programados", () => {
    // programado solo lunes (1): 2026-03-16 es lunes
    const mondays: Schedule = { type: "days_of_week", days: [1] };
    const entries: DomainEntry[] = [{ habitId: "m", localDate: "2026-03-16", amount: 1 }];
    expect(countPerfectDays([{ id: "m", schedule: mondays }], entries, TODAY)).toBe(1);
  });
});
