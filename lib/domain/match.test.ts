import { describe, expect, it } from "vitest";
import { normalize, resolveHabit } from "./match";

const habits = [
  { id: "1", name: "Gym", aliases: ["entrené", "pesas"] },
  { id: "2", name: "Agua", aliases: ["vaso"] },
  { id: "3", name: "Leer", aliases: ["leí", "lectura"] },
];

describe("resolveHabit", () => {
  it("resuelve por id, nombre y alias ignorando tildes y mayúsculas", () => {
    expect(resolveHabit(habits, "2")).toMatchObject({ type: "match", habit: { id: "2" } });
    expect(resolveHabit(habits, "GYM")).toMatchObject({ type: "match", habit: { id: "1" } });
    expect(resolveHabit(habits, "entrene")).toMatchObject({ type: "match", habit: { id: "1" } });
    expect(resolveHabit(habits, "lei")).toMatchObject({ type: "match", habit: { id: "3" } });
  });

  it("coincidencia parcial única", () => {
    expect(resolveHabit(habits, "lect")).toMatchObject({ type: "match", habit: { id: "3" } });
  });

  it("ambiguo y sin match", () => {
    expect(resolveHabit([...habits, { id: "4", name: "Gym casa", aliases: [] }], "gy").type).toBe("ambiguous");
    expect(resolveHabit(habits, "yoga").type).toBe("none");
    expect(resolveHabit(habits, "  ").type).toBe("none");
  });

  it("normalize", () => {
    expect(normalize("  Leí, 20 MIN! ")).toBe("lei 20 min");
  });
});
