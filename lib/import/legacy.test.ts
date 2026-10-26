import { describe, expect, it } from "vitest";
import { parseLegacy } from "./legacy";

const AR = "America/Argentina/Cordoba";

describe("parseLegacy", () => {
  const raw = {
    habits: [
      { id: "a", name: "Gym", frequency: { type: "weekly", target: 3 } },
      { id: "b", name: "Agua", frequency: { type: "daily" }, archived: true },
    ],
    checks: [
      { id: "1", habitId: "a", date: "2026-03-10" },
      { id: "2", habitId: "a", date: "2026-03-10" }, // duplicado
      { id: "3", habitId: "zzz", date: "2026-03-10" }, // huérfano
      { id: "4", habitId: "b", date: "2026-03-11" },
    ],
  };

  it("convierte frecuencia a schedule", () => {
    const { habits } = parseLegacy(raw, AR);
    expect(habits[0].schedule).toEqual({ type: "weekly", times: 3 });
    expect(habits[1].schedule).toEqual({ type: "daily" });
    expect(habits[1].archived).toBe(true);
  });

  it("descarta duplicados y checks huérfanos", () => {
    expect(parseLegacy(raw, AR).entries).toHaveLength(2);
  });

  it("marca source import y conserva la fecha local", () => {
    const [first] = parseLegacy(raw, AR).entries;
    expect(first.source).toBe("import");
    expect(first.localDate).toBe("2026-03-10");
    expect(first.occurredAt.toISOString().slice(0, 10)).toBe("2026-03-10");
  });

  it("rechaza datos mal formados", () => {
    expect(() => parseLegacy({ habits: [{}], checks: [] }, AR)).toThrow();
  });
});
