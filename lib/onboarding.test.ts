import { describe, expect, it } from "vitest";
import { TOUR_STEPS, findStep, stepAvailable, waitDone, type TourAnchor, type TourContext } from "./onboarding";

const ctx = (hasHabits: boolean, anchors: TourAnchor[]): TourContext => ({ hasHabits, has: (a) => anchors.includes(a) });
const ALL: TourAnchor[] = ["crear-habito", "fila-habito", "anillo", "semana", "nav-semana", "nav-objetivos", "nav-stats", "nav-ajustes"];
const ids = (c: TourContext) => {
  const out: string[] = [];
  for (let i = findStep(TOUR_STEPS, 0, 1, c); i !== -1; i = findStep(TOUR_STEPS, i + 1, 1, c)) out.push(TOUR_STEPS[i].id);
  return out;
};

describe("recorrido guiado: pasos", () => {
  it("sin hábitos arranca pidiendo crear uno, y ese paso espera", () => {
    const c = ctx(false, ["crear-habito", "nav-objetivos", "nav-ajustes"]);
    const first = findStep(TOUR_STEPS, 0, 1, c);
    expect(TOUR_STEPS[first].id).toBe("crear");
    expect(waitDone(TOUR_STEPS[first], c)).toBe(false);
    expect(waitDone(TOUR_STEPS[first], ctx(true, ALL))).toBe(true);
  });

  it("con hábitos se saltea el paso de crear y recorre todo", () => {
    expect(ids(ctx(true, ALL))).toEqual(["tocar", "mantener", "anillo", "semana", "objetivos", "ajustes"]);
  });

  it("si un ancla no está en pantalla, ese paso se saltea (nunca se señala a la nada)", () => {
    expect(ids(ctx(true, ["fila-habito", "nav-ajustes"]))).toEqual(["tocar", "mantener", "ajustes"]);
    expect(stepAvailable(TOUR_STEPS.find((s) => s.id === "anillo")!, ctx(true, []))).toBe(false);
  });

  it("para atrás busca el anterior disponible y al principio no hay más", () => {
    const c = ctx(true, ALL);
    const semana = TOUR_STEPS.findIndex((s) => s.id === "semana");
    expect(TOUR_STEPS[findStep(TOUR_STEPS, semana - 1, -1, c)].id).toBe("anillo");
    expect(findStep(TOUR_STEPS, TOUR_STEPS.findIndex((s) => s.id === "tocar") - 1, -1, c)).toBe(-1);
  });

  it("al final del recorrido no hay siguiente", () => {
    expect(findStep(TOUR_STEPS, TOUR_STEPS.length, 1, ctx(true, ALL))).toBe(-1);
  });
});
