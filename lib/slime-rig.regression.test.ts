import { describe, expect, it } from "vitest";
import type { Activity } from "./mascot";
import { blink, computePose } from "./slime-rig";

const ACTIVITIES: Activity[] = ["idle", "wave", "lift", "drink", "read", "meditate", "run", "sleep", "dance", "celebrate"];

describe("regresión: párpados con tiempo negativo", () => {
  // Chrome informó `<rect> height: negative value`: el tiempo del cuadro (rAF) puede llegar apenas
  // antes que `performance.now()`, el reloj retrocedía y el parpadeo daba un valor negativo.
  it("blink nunca es negativo, ni con un tiempo negativo o inválido", () => {
    for (let t = -5; t < 0; t += 0.01) expect(blink(t)).toBeGreaterThanOrEqual(0);
    expect(blink(NaN)).toBe(0);
    expect(blink(-0.003)).toBe(0);
  });

  it("ninguna actividad produce párpados ni agua fuera de rango con tiempos cercanos a cero", () => {
    for (const a of ACTIVITIES) {
      for (const t of [-0.01, -0.003, 0, 0.001, 0.05]) {
        const p = computePose(a, t);
        expect(p.lid, `${a}@${t}`).toBeGreaterThanOrEqual(0);
        expect(p.lid, `${a}@${t}`).toBeLessThanOrEqual(1);
        expect(p.water, `${a}@${t}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
