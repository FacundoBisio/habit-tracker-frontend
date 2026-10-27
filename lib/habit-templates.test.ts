import { describe, expect, it } from "vitest";
import { HABIT_ICONS } from "./habit-icons";
import { HABIT_TEMPLATES } from "./habit-templates";

describe("plantillas de hábitos", () => {
  it("usan íconos existentes, nombres únicos y cantidades válidas", () => {
    const icons = new Set<string>(HABIT_ICONS.map((i) => i.key));
    expect(new Set(HABIT_TEMPLATES.map((t) => t.name)).size).toBe(HABIT_TEMPLATES.length);
    for (const t of HABIT_TEMPLATES) {
      expect(icons.has(t.emoji), t.name).toBe(true);
      expect(t.defaultAmount).toBeGreaterThan(0);
      if (t.kind === "quantity") expect(t.unit, t.name).toBeTruthy();
    }
  });
});
