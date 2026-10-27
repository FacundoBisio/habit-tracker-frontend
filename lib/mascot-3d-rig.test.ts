import { describe, expect, it } from "vitest";
import type { Activity } from "./mascot";
import {
  L1, L2, blendPose, blendPoseInto, blink3, computePose3, computePose3Into, createAnimator3, createLimbs3, createRig, dist,
  solveLimbs3, solveLimbs3Into, stepAnimator3, stepRig3, stepRig3InPlace, twoBoneIK3, volumeScale, type Pose3, type V3,
} from "./mascot-3d-rig";

const ACTIVITIES: Activity[] = ["idle", "wave", "lift", "drink", "read", "meditate", "run", "sleep", "dance", "celebrate"];

describe("IK de dos huesos", () => {
  it("alcanza el objetivo y respeta los largos", () => {
    const s: V3 = [0.46, 0.48, 0];
    const target: V3 = [0.6, 0.5, 0.3];
    const { elbow, hand } = twoBoneIK3(s, target, L1, L2, [0.5, -0.8, 0.2]);
    expect(dist(hand, target)).toBeLessThan(1e-6);
    expect(dist(s, elbow)).toBeCloseTo(L1, 6);
    expect(dist(elbow, hand)).toBeCloseTo(L2, 6);
  });
  it("si el objetivo está lejos, estira el brazo sin romper los largos", () => {
    const s: V3 = [0.46, 0.48, 0];
    const { elbow, hand } = twoBoneIK3(s, [3, 3, 3], L1, L2, [0, -1, 0]);
    expect(dist(s, elbow)).toBeCloseTo(L1, 6);
    expect(dist(elbow, hand)).toBeLessThan(L2 + 1e-6);
  });
});

describe("poses", () => {
  it("son finitas y acotadas durante 20 s en todas las actividades", () => {
    for (const a of ACTIVITIES) {
      for (let i = 0; i < 1200; i++) {
        const p = computePose3(a, i / 60, { x: 0.3, y: -0.2 }, i % 400 === 0 ? 0 : -1);
        for (const [k, v] of Object.entries(p)) expect(Number.isFinite(v), `${a}.${k}`).toBe(true);
        expect(p.lid).toBeGreaterThanOrEqual(0);
        expect(p.lid).toBeLessThanOrEqual(1);
        expect(Math.abs(p.rotZ)).toBeLessThan(45);
        expect(p.lift).toBeLessThan(0.6);
      }
    }
  });

  it("blink3 nunca es negativo (ni con tiempo negativo o NaN)", () => {
    for (const t of [-5, -0.001, 0, 1, 7.3, NaN]) expect(blink3(t)).toBeGreaterThanOrEqual(0);
  });

  it("lift: un solo brazo activo, con la mancuerna y el bíceps inflándose", () => {
    let maxFlex = 0;
    for (let i = 0; i < 360; i++) {
      const p = computePose3("lift", i / 60);
      maxFlex = Math.max(maxFlex, p.flex);
      if (i > 120) expect(p.vDumbbell).toBeGreaterThan(0.9);
    }
    expect(maxFlex).toBeGreaterThan(0.5);
    expect(computePose3("lift", 2).eL).toBe(0);
  });

  it("drink: la mano llega a la boca en algún momento", () => {
    let best = 9;
    for (let i = 0; i < 300; i++) {
      const L = solveLimbs3(computePose3("drink", i / 60));
      best = Math.min(best, dist(L.handR, [0, 0.43, 0.5]));
    }
    expect(best).toBeLessThan(0.3);
  });

  it("celebrate: salta (lift sube) y vuelve a apoyarse", () => {
    const lifts = Array.from({ length: 240 }, (_, i) => computePose3("celebrate", i / 60).lift);
    expect(Math.max(...lifts)).toBeGreaterThan(0.05);
    expect(Math.min(...lifts)).toBeLessThanOrEqual(0.01);
  });

  it("run: hops leves", () => {
    const lifts = Array.from({ length: 240 }, (_, i) => computePose3("run", i / 60).lift);
    expect(Math.max(...lifts)).toBeGreaterThan(0.005);
    expect(Math.max(...lifts)).toBeLessThan(0.2);
  });

  it("los brazos escalan con la extensión", () => {
    const p: Pose3 = { ...computePose3("idle", 0), eL: 0, eR: 1 };
    const L = solveLimbs3(p);
    expect(L.scaleL).toBe(0);
    expect(L.scaleR).toBeGreaterThan(2);
  });
});

describe("resortes y volumen", () => {
  it("stepRig3 converge al objetivo sin explotar, incluso con dt grandes", () => {
    const target = computePose3("celebrate", 1.1);
    let rig = createRig();
    for (let i = 0; i < 600; i++) {
      rig = stepRig3(rig, target, i % 7 === 0 ? 5 : 1 / 60);
      for (const v of Object.values(rig.pose)) expect(Number.isFinite(v)).toBe(true);
    }
    expect(Math.abs(rig.pose.lift - target.lift)).toBeLessThan(0.01);
    expect(Math.abs(rig.pose.sy - target.sy)).toBeLessThan(0.01);
  });

  it("volumeScale conserva aproximadamente el volumen y está acotado", () => {
    for (const sy of [0.5, 0.8, 1, 1.1, 2]) {
      const v = volumeScale(sy);
      expect(v.sy).toBeGreaterThanOrEqual(0.7);
      expect(v.sy).toBeLessThanOrEqual(1.25);
      expect(v.sx * v.sy * v.sz).toBeGreaterThan(0.8);
      expect(v.sx * v.sy * v.sz).toBeLessThan(1.25);
    }
  });
});

describe("un solo movimiento principal por actividad", () => {
  const keys = (p: Pose3) => (Object.keys(p) as (keyof Pose3)[]).filter((k) => k !== "lid");

  it("es periódica: lo secundario es función de la fase principal (no hay relojes independientes)", () => {
    const periods: Partial<Record<Activity, number>> = {
      wave: 1 / 1.8, lift: 3.4, drink: 4.4, read: 3.4, run: 0.5, dance: 1 / 1.6, celebrate: 2.6,
      meditate: (2 * Math.PI) / 1.15, sleep: (2 * Math.PI) / 0.95,
    };
    for (const [a, T] of Object.entries(periods) as [Activity, number][]) {
      for (let i = 0; i < 40; i++) {
        const t = 5 + i * 0.173;
        const p = computePose3(a, t);
        const q = computePose3(a, t + T);
        for (const k of keys(p)) expect(q[k], `${a}.${k} @${t}`).toBeCloseTo(p[k], 5);
      }
    }
  });

  it("en una actividad no hay saltito ni mirada/puntero del reposo", () => {
    for (const a of ["wave", "lift", "drink", "read", "sleep"] as Activity[]) {
      for (let i = 0; i < 4000; i++) {
        const t = i * 0.05;
        const p = computePose3(a, t);
        expect(p.lift, `${a} hop @${t}`).toBe(0);
        expect(computePose3(a, t, { x: 0.9, y: -0.8 })).toEqual(p);
      }
    }
    for (const a of ACTIVITIES.filter((x) => x !== "idle")) {
      expect(computePose3(a, 3.1, { x: 1, y: 1 })).toEqual(computePose3(a, 3.1));
    }
  });

  it("el reposo sí sigue al puntero", () => {
    expect(computePose3("idle", 3, { x: 0.8, y: 0.2 }).lookX).toBeCloseTo(0.8, 6);
  });

  it("los resortes se amortiguan rápido: como mucho 2 cruces y poco sobreimpulso", () => {
    let rig = createRig({ ...computePose3("idle", 0), lift: 0, sy: 1 });
    const target = { ...rig.pose, lift: 0.14, sy: 0.9, rotZ: 6 };
    let crosses = 0;
    let prevSign = 0;
    let maxOver = 0;
    for (let i = 0; i < 180; i++) {
      rig = stepRig3(rig, target, 1 / 60);
      const e = rig.pose.lift - 0.14;
      maxOver = Math.max(maxOver, e);
      const sign = Math.abs(e) < 1e-4 ? prevSign : Math.sign(e);
      if (prevSign !== 0 && sign !== 0 && sign !== prevSign) crosses++;
      if (sign !== 0) prevSign = sign;
    }
    expect(crosses).toBeLessThanOrEqual(2);
    expect(maxOver).toBeLessThan(0.14 * 0.1);
    expect(Math.abs(rig.pose.lift - 0.14)).toBeLessThan(1e-3);
  });

  it("blendPose mezcla sin saltos: el curl mezcla su peso (no cambia de modo de golpe)", () => {
    const a = computePose3("lift", 1.2);
    const b = computePose3("dance", 0.3);
    expect(blendPose(a, b, 0)).toEqual({ ...a, curl: a.curl });
    expect(blendPose(a, b, 1).hLy).toBeCloseTo(b.hLy, 9);
    expect(blendPose(a, b, 1).curl).toBe(b.curl);
    const mid = blendPose(a, b, 0.5);
    expect(mid.eR).toBeCloseTo((a.eR + b.eR) / 2, 6);
    expect(mid.curlW).toBeCloseTo(0.5, 6);
    expect(mid.curl).toBe(a.curl); // la fase es la de la pose que usa el curl
  });
});

describe("versiones en el lugar (sin objetos nuevos por cuadro)", () => {
  it("computePose3Into / blendPoseInto / stepRig3InPlace / solveLimbs3Into dan lo mismo que las inmutables", () => {
    const out = { ...computePose3("idle", 0) };
    for (const a of ACTIVITIES) {
      expect(computePose3Into(out, a, 2.345, { x: 0.2, y: 0.1 }, 0.1)).toEqual(computePose3(a, 2.345, { x: 0.2, y: 0.1 }, 0.1));
    }
    const a = computePose3("read", 1.1);
    const b = computePose3("wave", 0.4);
    const expected = blendPose(a, b, 0.37);
    expect(blendPoseInto({ ...a }, a, b, 0.37)).toEqual(expected);
    const aliasA = { ...a };
    expect(blendPoseInto(aliasA, aliasA, b, 0.37)).toEqual(expected); // `out` puede ser una de las entradas
    const aliasB = { ...b };
    expect(blendPoseInto(aliasB, a, aliasB, 0.37)).toEqual(expected);

    const rig = createRig(a);
    const before = stepRig3(rig, b, 1 / 60);
    expect(stepRig3InPlace(rig, b, 1 / 60)).toEqual(before);
    const L = createLimbs3();
    expect(solveLimbs3Into(b, L)).toEqual(solveLimbs3(b));
  });

  it("stepAnimator3 reutiliza siempre los mismos objetos", () => {
    const an = createAnimator3();
    const refs = [an.rig.pose, an.target, an.limbs, an.limbs.handL, an.props, an.props.book];
    for (let i = 0; i < 120; i++) stepAnimator3(an, 1 / 60, i < 60 ? "idle" : "read", { x: 0.3, y: 0, w: 1 }, i === 30);
    refs.forEach((r, i) => expect(r).toBe([an.rig.pose, an.target, an.limbs, an.limbs.handL, an.props, an.props.book][i]));
  });

  it("IK: un brazo casi escondido no hace volar el codo", () => {
    const s: V3 = [0.46, 0.48, 0.04];
    for (const e of [1e-3, 2e-4, 1e-4, 5e-5, 1e-6, 0]) {
      const { elbow, hand } = twoBoneIK3(s, [0.7, 0.3, 0.1], L1 * e, L2 * e, [0.5, -0.8, 0.2]);
      expect(dist(s, elbow), `e=${e}`).toBeLessThanOrEqual(L1 * e + 1e-12);
      expect(dist(s, hand), `e=${e}`).toBeLessThanOrEqual((L1 + L2) * e + 1e-12);
    }
  });
});
