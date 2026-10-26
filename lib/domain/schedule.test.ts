import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { complianceRate, isScheduledOn } from "./schedule";

describe("schedule", () => {
  it("days_of_week solo aplica a sus días", () => {
    const s = { type: "days_of_week", days: [1, 3] } as const;
    expect(isScheduledOn({ ...s, days: [...s.days] }, "2026-03-09")).toBe(true); // lunes
    expect(isScheduledOn({ ...s, days: [...s.days] }, "2026-03-10")).toBe(false); // martes
  });

  it("cumplimiento diario en ventana de 10 días", () => {
    const active = new Set(["2026-03-10", "2026-03-09", "2026-03-08", "2026-03-07", "2026-03-06"]);
    expect(complianceRate({ type: "daily" }, active, "2026-03-10", 10, addDays)).toBe(50);
  });

  it("weekly 3x: 3 días en 7 = 100%, tope 100", () => {
    const active = new Set(["2026-03-10", "2026-03-09", "2026-03-08", "2026-03-07"]);
    expect(complianceRate({ type: "weekly", times: 3 }, active, "2026-03-10", 7, addDays)).toBe(100);
  });
});
