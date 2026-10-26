import { describe, expect, it } from "vitest";
import type { Activity } from "./mascot";
import {
  ARM, GROUND, POINTS, REST, W, bodyPath, computePose, createJelly, ikNatural, outline, shoulders, solveArms,
  stepJelly, stepRig, twoBoneIK, type Pose, type V,
} from "./slime-rig";

const dist = (a: V, b: V) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const ACTIVITIES: Activity[] = ["idle", "wave", "lift", "drink", "read", "meditate", "run", "sleep", "dance", "celebrate"];

describe("cinemática inversa", () => {
  it("respeta los largos y alcanza el objetivo", () => {
    const { joint, end } = twoBoneIK([0, 0], [20, 15], 20, 22, 1);
    expect(dist([0, 0], joint)).toBeCloseTo(20, 6);
    expect(dist(joint, end)).toBeCloseTo(22, 6);
    expect(end[0]).toBeCloseTo(20, 6);
  });

  it("fuera de alcance, el brazo queda estirado hacia el objetivo", () => {
    const { end } = twoBoneIK([0, 0], [300, 0], 20, 22, 1);
    expect(dist([0, 0], end)).toBeGreaterThan(41.9);
    expect(end[1]).toBeCloseTo(0, 6);
  });

  it("ikNatural dobla el codo hacia afuera en un brazo que cuelga (derecho) y hacia el otro lado en el izquierdo", () => {
    const right = ikNatural([120, 120], [128, 138], 1);
    expect(right.joint[0]).toBeGreaterThan(120);
    const left = ikNatural([40, 120], [32, 138], -1);
    expect(left.joint[0]).toBeLessThan(40);
  });

  it("no produce NaN con el objetivo en el hombro", () => {
    const r = twoBoneIK([5, 5], [5, 5], 20, 22, 1);
    expect(Number.isFinite(r.joint[0] + r.end[1])).toBe(true);
  });
});

describe("gelatina", () => {
  const rest = createJelly();

  it("en reposo el contorno es simétrico, apoyado en el suelo y de altura H", () => {
    const pts = outline(REST, rest);
    expect(pts).toHaveLength(POINTS);
    expect(pts[0][1]).toBeCloseTo(GROUND, 3);
    expect(pts[POINTS - 1][1]).toBeCloseTo(GROUND, 3);
    expect(pts[0][0]).toBeCloseTo(80 - W, 3);
    expect(pts[POINTS - 1][0]).toBeCloseTo(80 + W, 3);
    const mid = Math.floor(POINTS / 2);
    expect(pts[mid][1]).toBeLessThan(GROUND - 55);
    for (let i = 0; i < POINTS; i++) {
      expect(pts[i][0] - 80).toBeCloseTo(-(pts[POINTS - 1 - i][0] - 80), 3);
      expect(pts[i][1]).toBeCloseTo(pts[POINTS - 1 - i][1], 3);
    }
  });

  it("el path es válido y cerrado", () => {
    const d = bodyPath(outline(REST, rest), REST);
    expect(d.startsWith("M")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d).not.toContain("NaN");
  });

  it("un aterrizaje hace temblar la gelatina y después se asienta", () => {
    let j = createJelly();
    const dt = 1 / 60;
    let peak = 0;
    // 1 s en el aire y aterrizaje brusco
    for (let i = 0; i < 40; i++) j = stepJelly(j, { ...REST, lift: 50 * Math.sin((i / 40) * Math.PI) }, dt);
    for (let i = 0; i < 60; i++) {
      j = stepJelly(j, { ...REST, lift: 0 }, dt);
      peak = Math.max(peak, ...j.o.map(Math.abs));
    }
    expect(peak).toBeGreaterThan(0.3); // tiembla
    for (let i = 0; i < 360; i++) j = stepJelly(j, { ...REST, lift: 0 }, dt);
    expect(Math.max(...j.o.map(Math.abs))).toBeLessThan(0.15); // se asienta
  });

  it("es estable con pasos de tiempo grandes y nunca explota", () => {
    let j = createJelly();
    for (let i = 0; i < 400; i++) j = stepJelly(j, { ...REST, lift: i % 2 ? 80 : 0, bx: 80 + (i % 3) * 30 }, 0.05);
    expect(j.o.every((n) => Number.isFinite(n) && Math.abs(n) <= 16)).toBe(true);
  });

  it("al saltar, el cuerpo se estira (más alto y más angosto) y al caer se aplasta", () => {
    let maxSy = 0;
    let minSy = 9;
    for (let t = 0; t < 2.6; t += 0.01) {
      const p = computePose("celebrate", t);
      maxSy = Math.max(maxSy, p.sy);
      minSy = Math.min(minSy, p.sy);
      // el volumen aproximado se conserva
      expect(p.sx * p.sy).toBeGreaterThan(0.85);
      expect(p.sx * p.sy).toBeLessThan(1.2);
    }
    expect(maxSy).toBeGreaterThan(1.05);
    expect(minSy).toBeLessThan(0.93);
  });
});

describe("poses", () => {
  it("todas las actividades dan poses finitas y brazos con largos fijos durante 20 s", () => {
    for (const a of ACTIVITIES) {
      for (let t = 0; t < 20; t += 0.05) {
        const p = computePose(a, t);
        for (const v of Object.values(p)) expect(Number.isFinite(v), `${a}@${t}`).toBe(true);
        const arms = solveArms(p);
        // Con el brazo metido en el cuerpo (extensión ~0) no se dibuja: solo se valida cuando está afuera
        if (p.armLe > 0.2) {
          expect(dist(arms.shoulderL, arms.elbowL)).toBeCloseTo(ARM.l1, 3);
          expect(dist(arms.elbowL, arms.handL)).toBeCloseTo(ARM.l2, 3);
        }
        expect(p.lid).toBeGreaterThanOrEqual(0);
        expect(p.lid).toBeLessThanOrEqual(1);
      }
    }
  });

  it("gimnasio: un solo brazo (el derecho) hace curl; el izquierdo queda metido", () => {
    let minHandY = Infinity;
    let maxHandY = -Infinity;
    let maxFlex = 0;
    for (let t = 0; t < 3.4; t += 0.02) {
      const p = computePose("lift", t);
      expect(p.armLe).toBe(0);
      expect(p.armRe).toBe(1);
      maxFlex = Math.max(maxFlex, p.flex);
      const { handR, shoulderR } = solveArms(p);
      minHandY = Math.min(minHandY, handR[1] - shoulderR[1]);
      maxHandY = Math.max(maxHandY, handR[1] - shoulderR[1]);
    }
    expect(maxHandY).toBeGreaterThan(20); // la mancuerna cuelga junto al cuerpo
    expect(minHandY).toBeLessThan(5); // y sube hasta la altura del hombro
    expect(maxFlex).toBeGreaterThan(0.95); // el bíceps se infla al máximo
  });

  it("gimnasio: el codo se queda fijo cerca del cuerpo mientras el antebrazo gira", () => {
    const elbows: V[] = [];
    for (let t = 0.4; t < 1.6; t += 0.1) {
      const p = computePose("lift", t);
      const a = solveArms(p);
      elbows.push([a.elbowR[0] - a.shoulderR[0], a.elbowR[1] - a.shoulderR[1]]);
    }
    const spread = Math.max(...elbows.map((e) => e[0])) - Math.min(...elbows.map((e) => e[0]));
    expect(spread).toBeLessThan(6);
  });

  it("tomar agua: la mano sube hacia la cara, el vaso se inclina y se vacía", () => {
    let minY = Infinity;
    let maxTilt = 0;
    let minWater = 1;
    for (let t = 0; t < 4.4; t += 0.02) {
      const p = computePose("drink", t);
      minY = Math.min(minY, p.handRy);
      maxTilt = Math.max(maxTilt, p.glassTilt);
      minWater = Math.min(minWater, p.water);
    }
    expect(minY).toBeLessThan(GROUND - 48);
    expect(maxTilt).toBeGreaterThan(40);
    expect(minWater).toBeLessThan(0.5);
  });

  it("correr: saltitos con aplastamiento al caer, estiramiento en el aire e inclinación", () => {
    let maxLift = 0;
    let minSy = 9;
    let maxSy = 0;
    for (let t = 0; t < 2; t += 0.01) {
      const p = computePose("run", t);
      maxLift = Math.max(maxLift, p.lift);
      minSy = Math.min(minSy, p.sy);
      maxSy = Math.max(maxSy, p.sy);
      expect(p.tilt).toBeGreaterThan(3);
    }
    expect(maxLift).toBeGreaterThan(6);
    expect(maxLift).toBeLessThan(14); // trote suave, no saltos grandes
    expect(minSy).toBeLessThan(0.95);
    expect(maxSy).toBeGreaterThan(1.04);
  });

  it("meditar y dormir cierran los ojos; el reposo parpadea de vez en cuando y mira al usuario", () => {
    expect(computePose("meditate", 1).lid).toBe(1);
    expect(computePose("sleep", 1).lid).toBe(1);
    let closed = 0;
    for (let t = 0; t < 30; t += 0.01) if (computePose("idle", t).lid > 0.5) closed++;
    expect(closed).toBeGreaterThan(0);
    expect(closed / 3000).toBeLessThan(0.1);
    const p = computePose("idle", 1, { x: 0.8, y: -0.4 });
    expect(p.lookX).toBeCloseTo(0.8, 6);
  });

  it("en reposo hay un saltito periódico", () => {
    let maxLift = 0;
    for (let t = 0; t < 8; t += 0.01) maxLift = Math.max(maxLift, computePose("idle", t).lift);
    expect(maxLift).toBeGreaterThan(3);
    expect(maxLift).toBeLessThan(8); // saltito discreto
  });
});

describe("suavizado", () => {
  it("converge a la pose objetivo sin saltar", () => {
    const target = computePose("celebrate", 0.7);
    let cur: Pose = computePose("idle", 0);
    const first = stepRig(cur, target, 0.016);
    expect(Math.abs(first.lift - cur.lift)).toBeLessThan(Math.abs(target.lift - cur.lift));
    for (let i = 0; i < 200; i++) cur = stepRig(cur, target, 0.016);
    expect(cur.lift).toBeCloseTo(target.lift, 1);
  });

  it("los hombros siguen al cuerpo (altura y ancho)", () => {
    const a = shoulders(REST);
    const b = shoulders({ ...REST, lift: 30, sx: 1.2 });
    expect(b.L[1]).toBeLessThan(a.L[1] - 20);
    expect(b.R[0] - b.L[0]).toBeGreaterThan(a.R[0] - a.L[0]);
  });
});
