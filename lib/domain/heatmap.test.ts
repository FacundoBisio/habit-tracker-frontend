import { describe, expect, it } from "vitest";
import { heatmapRange, monthStartingIn } from "./heatmap";

describe("heatmapRange", () => {
  it("arranca en el mes del primer registro", () => {
    const r = heatmapRange("2026-09-17", "2026-10-27", 1);
    expect(r.from).toBe("2026-09-01");
    expect(r.weeks[0]).toBe("2026-08-31"); // lunes de la semana del 1/9
    expect(r.weeks.at(-1)).toBe("2026-10-26"); // semana actual
  });

  it("sin registros muestra solo el mes actual", () => {
    const r = heatmapRange(undefined, "2026-10-27", 0);
    expect(r.from).toBe("2026-10-01");
    expect(r.weeks).toHaveLength(5);
  });

  it("con más de un año de uso tiene tope de 12 meses", () => {
    const r = heatmapRange("2023-02-10", "2026-10-27", 1);
    expect(r.from).toBe("2025-10-01");
    expect(r.weeks.length).toBeLessThanOrEqual(58);
  });

  it("ignora fechas futuras", () => {
    expect(heatmapRange("2027-01-05", "2026-10-27", 1).from).toBe("2026-10-01");
  });
});

describe("monthStartingIn", () => {
  it("devuelve el 1.º del mes si cae en la semana", () => {
    expect(monthStartingIn("2026-09-28", "2026-09-01")).toBe("2026-10-01");
    expect(monthStartingIn("2026-10-05", "2026-09-01")).toBeUndefined();
  });

  it("no marca meses anteriores al inicio", () => {
    expect(monthStartingIn("2026-08-31", "2026-10-01")).toBeUndefined();
  });
});
