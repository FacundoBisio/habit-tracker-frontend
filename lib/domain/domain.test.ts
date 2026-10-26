import { describe, expect, it } from "vitest";
import { addDays, diffDays, startOfWeek, toLocalDate, weekRange } from "./dates";
import { computeGoalProgress } from "./goals";
import { computeStreak } from "./streaks";
import type { DomainEntry, Schedule } from "./types";

const AR = "America/Argentina/Cordoba";
const e = (localDate: string, habitId = "h", amount = 1): DomainEntry => ({ habitId, localDate, amount });

describe("dates", () => {
  it("un registro a las 23:30 hora Argentina cae en el mismo día (no en el UTC siguiente)", () => {
    // 23:30 AR (UTC-3) = 02:30 UTC del día siguiente
    expect(toLocalDate(new Date("2026-03-11T02:30:00Z"), AR)).toBe("2026-03-10");
  });

  it("después de medianoche local cambia el día", () => {
    expect(toLocalDate(new Date("2026-03-11T03:00:00Z"), AR)).toBe("2026-03-11");
  });

  it("la semana arranca el lunes y el domingo pertenece a la semana anterior", () => {
    expect(startOfWeek("2026-03-09", 1)).toBe("2026-03-09"); // lunes
    expect(startOfWeek("2026-03-15", 1)).toBe("2026-03-09"); // domingo
    expect(startOfWeek("2026-03-16", 1)).toBe("2026-03-16"); // lunes siguiente
    expect(weekRange("2026-03-12", 1)).toEqual({ start: "2026-03-09", end: "2026-03-15" });
  });

  it("la semana puede arrancar el domingo", () => {
    expect(startOfWeek("2026-03-15", 0)).toBe("2026-03-15");
  });

  it("addDays/diffDays cruzan mes y año", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-02-28", "2026-03-01")).toBe(1);
  });
});

describe("streaks daily", () => {
  it("cuenta días consecutivos y hoy pendiente no corta", () => {
    const entries = [e("2026-03-08"), e("2026-03-09")];
    expect(computeStreak(entries, "h", { type: "daily" }, "2026-03-10")).toEqual({ current: 2, longest: 2 });
  });

  it("un día sin registro corta la racha", () => {
    const entries = [e("2026-03-05"), e("2026-03-06"), e("2026-03-09"), e("2026-03-10")];
    expect(computeStreak(entries, "h", { type: "daily" }, "2026-03-10")).toEqual({ current: 2, longest: 2 });
  });

  it("sin registros ayer ni hoy la racha actual es 0", () => {
    const entries = [e("2026-03-05")];
    expect(computeStreak(entries, "h", { type: "daily" }, "2026-03-10").current).toBe(0);
  });

  it("ignora otros hábitos", () => {
    expect(computeStreak([e("2026-03-10", "otro")], "h", { type: "daily" }, "2026-03-10").current).toBe(0);
  });
});

describe("streaks days_of_week", () => {
  it("saltea los días no programados", () => {
    // lun(9) y mié(11) programados; el martes no cuenta
    const schedule: Schedule = { type: "days_of_week", days: [1, 3] };
    const entries = [e("2026-03-09"), e("2026-03-11")];
    expect(computeStreak(entries, "h", schedule, "2026-03-11").current).toBe(2);
  });
});

describe("streaks weekly", () => {
  const schedule: Schedule = { type: "weekly", times: 3 };
  const week = (start: string, n: number) => Array.from({ length: n }, (_, i) => e(addDays(start, i)));

  it("cuenta semanas consecutivas que cumplen el objetivo", () => {
    const entries = [...week("2026-02-23", 3), ...week("2026-03-02", 3), ...week("2026-03-09", 3)];
    expect(computeStreak(entries, "h", schedule, "2026-03-12")).toEqual({ current: 3, longest: 3 });
  });

  it("la semana en curso incompleta no corta", () => {
    const entries = [...week("2026-03-02", 3), ...week("2026-03-09", 1)];
    expect(computeStreak(entries, "h", schedule, "2026-03-10").current).toBe(1);
  });

  it("una semana incumplida corta la racha", () => {
    const entries = [...week("2026-02-23", 3), ...week("2026-03-02", 1), ...week("2026-03-09", 3)];
    expect(computeStreak(entries, "h", schedule, "2026-03-15")).toEqual({ current: 1, longest: 1 });
  });
});

describe("goals", () => {
  const base = { periodStart: "2026-11-01", periodEnd: "2026-11-30" };
  const links = [{ habitId: "run", weight: 1 }];

  it("sum: suma cantidades y calcula ritmo", () => {
    const goal = { ...base, kind: "sum", targetValue: 40 } as const;
    const entries = [e("2026-11-02", "run", 5), e("2026-11-10", "run", 5), e("2026-12-01", "run", 99)];
    const p = computeGoalProgress(goal, links, entries, "2026-11-15");
    expect(p.current).toBe(10);
    expect(p.pct).toBe(25);
    expect(p.expected).toBe(20); // 15/30 de 40
    expect(p.delta).toBe(-10);
    expect(p.daysLeft).toBe(15);
    expect(p.completed).toBe(false);
  });

  it("sum: marca completado al cruzar el target y respeta pesos", () => {
    const goal = { ...base, kind: "sum", targetValue: 10 } as const;
    const w = [{ habitId: "run", weight: 2 }];
    const p = computeGoalProgress(goal, w, [e("2026-11-03", "run", 5)], "2026-11-03");
    expect(p.current).toBe(10);
    expect(p.completed).toBe(true);
  });

  it("count: cuenta registros del período", () => {
    const goal = { ...base, kind: "count", targetValue: 12 } as const;
    const p = computeGoalProgress(goal, links, [e("2026-11-01", "run"), e("2026-11-02", "run")], "2026-11-02");
    expect(p.current).toBe(2);
  });

  it("frequency: semanas con >= N días activos", () => {
    const goal = {
      kind: "frequency",
      targetValue: 3,
      periodStart: "2026-03-02",
      periodEnd: "2026-04-26", // 8 semanas
    } as const;
    const gym = [{ habitId: "gym", weight: 1 }];
    const entries = [
      e("2026-03-02", "gym"), e("2026-03-04", "gym"), e("2026-03-06", "gym"), // sem 1 ok
      e("2026-03-09", "gym"), e("2026-03-10", "gym"), // sem 2 no
    ];
    const p = computeGoalProgress(goal, gym, entries, "2026-03-15");
    expect(p.target).toBe(8);
    expect(p.current).toBe(1);
  });

  it("frequency: dos registros el mismo día cuentan como un día", () => {
    const goal = { kind: "frequency", targetValue: 2, periodStart: "2026-03-02", periodEnd: "2026-03-08" } as const;
    const gym = [{ habitId: "gym", weight: 1 }];
    const p = computeGoalProgress(goal, gym, [e("2026-03-02", "gym"), e("2026-03-02", "gym")], "2026-03-05");
    expect(p.current).toBe(0);
  });

  it("streak: racha más larga dentro del período", () => {
    const goal = { ...base, kind: "streak", targetValue: 5 } as const;
    const entries = ["02", "03", "05", "06", "07"].map((d) => e(`2026-11-${d}`, "run"));
    expect(computeGoalProgress(goal, links, entries, "2026-11-07").current).toBe(3);
  });
});
