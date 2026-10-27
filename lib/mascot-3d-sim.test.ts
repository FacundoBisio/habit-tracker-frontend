import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTIVITY_MS, MAX_EXIT_WAIT_MS, getActivityOverride, playActivity, resetActivity, setActivityExitDelay, type Activity } from "./mascot";
import {
  ACTIVITY_PERIOD, BODY_CENTER, BODY_R, L1, L2, LOOK_HOLD_S, PAGE_HIDDEN, blendPose, computePose3, createLook3, dist,
  isNaturalExit, naturalExitDelay, pageVisible, pointLook3, pupilOffset3, releaseLook3, shoulderAt, solveLimbs3,
  updateLook3, volumeScale, type Limbs3, type Pose3, type Props3, type V3,
} from "./mascot-3d-rig";
import { runSchedule, simulate } from "./mascot-3d-sim";

const ACTIVITIES: Activity[] = ["idle", "wave", "lift", "drink", "read", "meditate", "run", "sleep", "dance", "celebrate"];

/**
 * Desplazamiento máximo por cuadro (60 fps) de manos, codos y props en un cambio de actividad. Calibrado midiendo:
 * el movimiento normal más rápido (el curl de lift y los brazos de run) llega a ~0,037 por cuadro, y una mezcla larga
 * (las manos dan media vuelta alrededor del hombro) a ~0,048. Los defectos que esto detecta eran mucho mayores: el
 * salto del curl (M1), el codo que se daba vuelta y el latigazo al pasar la mano junto al hombro daban 0,1–0,44.
 */
const STEP_MAX = 0.05;
/** El movimiento normal (sin cambios de actividad) tiene que quedar por debajo de esto. */
const STEADY_MAX = 0.04;
/** Distancia mínima al centro del cuerpo de codos, manos y mitades de cada segmento (radio 0,5 − 0,02). */
const SKIN = BODY_R - 0.02;

const mid = (a: V3, b: V3): V3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

type Points = Record<string, V3>;
/** Puntos a vigilar en un cuadro: manos, codos y los props que se ven. */
function points(L: Limbs3, P: Props3, p: Pose3): Points {
  const o: Points = { handL: [...L.handL], handR: [...L.handR], elbowL: [...L.elbowL], elbowR: [...L.elbowR] };
  if (p.vDumbbell > 0.03) o.dumbbell = [...P.dumbbell];
  if (p.vGlass > 0.03) o.glass = [...P.glass];
  if (p.vBook > 0.03) o.book = [...P.book];
  return o;
}

/** Corre la agenda y devuelve el mayor desplazamiento por cuadro desde `from` (s) y dónde ocurrió. */
function maxStep(schedule: { at: number; act: Activity }[], duration: number, from: number, pokes: number[] = []) {
  let prev: Points | null = null;
  let max = 0;
  let where = "";
  runSchedule(schedule, duration, { pokes }, (f) => {
    const cur = points(f.limbs, f.props, f.pose);
    if (prev && f.t > from) {
      for (const k of Object.keys(cur)) {
        if (!prev[k]) continue;
        const d = dist(cur[k], prev[k]);
        if (d > max) {
          max = d;
          where = `${k} @${f.t.toFixed(3)}`;
        }
      }
    }
    prev = cur;
  });
  return { max, where };
}

/** Generador pseudoaleatorio con semilla (los tests tienen que ser reproducibles). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("simulador", () => {
  it("reproduce el bucle: arranca asentado, cambia de actividad y devuelve cuadros independientes", () => {
    const frames = simulate("idle", "wave", 1, 2);
    expect(frames.length).toBeGreaterThan(110);
    expect(frames[0].act).toBe("idle");
    expect(frames[frames.length - 1].act).toBe("wave");
    expect(frames[0].limbs.handL).not.toBe(frames[1].limbs.handL);
  });
});

describe("continuidad (sin saltos)", () => {
  it("el movimiento normal de cada actividad queda por debajo del umbral de calibración", () => {
    for (const a of ACTIVITIES) {
      const { max, where } = maxStep([{ at: 0, act: a }], 1 + 2 * ACTIVITY_PERIOD[a], 1);
      expect(max, `${a} ${where}`).toBeLessThan(STEADY_MAX);
    }
  });

  // 10 × 10 transiciones, cambiando en 5 fases del ciclo de la actividad de origen, con un toque en medio
  describe.each(ACTIVITIES)("desde %s", (from) => {
    it("a cualquier actividad, en 5 fases del ciclo y con un toque en medio", { timeout: 60_000 }, () => {
      for (const to of ACTIVITIES) {
        for (let k = 0; k < 5; k++) {
          const sw = 2 + (k / 5) * ACTIVITY_PERIOD[from];
          const { max, where } = maxStep([{ at: 0, act: from }, { at: sw, act: to }], sw + 1.6, sw - 0.2, [sw + 0.12]);
          expect(max, `${from}→${to} fase ${k}/5: ${where}`).toBeLessThan(STEP_MAX);
        }
      }
    });
  });

  it("mezcla interrumpida (M2): A→B y a los 0,1 s B→C no pega un salto", { timeout: 60_000 }, () => {
    const set: Activity[] = ["idle", "wave", "lift", "drink", "read", "dance", "celebrate"];
    for (const a of set) {
      for (const b of set) {
        for (const c of set) {
          if (a === b || b === c) continue;
          const sw = 2.3;
          const sched = [{ at: 0, act: a }, { at: sw, act: b }, { at: sw + 0.1, act: c }];
          const { max, where } = maxStep(sched, sw + 1.6, sw - 0.1);
          expect(max, `${a}→${b}→${c}: ${where}`).toBeLessThan(STEP_MAX);
        }
      }
    }
  });

  it("M1: entre IK y curl la mano derecha se mueve sin teletransportarse", () => {
    const idle = computePose3("idle", 1);
    for (const curlT of [0.3, 1.2, 1.7]) {
      const lift = computePose3("lift", curlT);
      let prev = solveLimbs3(blendPose(idle, lift, 0)).handR;
      for (let i = 1; i <= 200; i++) {
        const h = solveLimbs3(blendPose(idle, lift, i / 200)).handR;
        expect(dist(h, prev), `curl @${curlT} w=${i / 200}`).toBeLessThan(0.02);
        prev = h;
      }
    }
  });

  it("M9: los props van pegados a la mano (mismo desplazamiento que la mano)", () => {
    runSchedule([{ at: 0, act: "lift" }, { at: 4, act: "drink" }, { at: 9, act: "read" }], 13, {}, (f) => {
      const { handL, handR } = f.limbs;
      if (f.pose.vDumbbell > 0.03) expect(dist(f.props.dumbbell, handR)).toBeCloseTo(Math.hypot(0.01, 0.02), 6);
      if (f.pose.vGlass > 0.03) expect(dist(f.props.glass, handR)).toBeLessThan(0.08);
      if (f.pose.vBook > 0.03) expect(dist(f.props.book, mid(handL, handR))).toBeCloseTo(Math.hypot(0.07, 0.05), 6);
    });
  });
});

describe("cuerpo y alcance", () => {
  /** Codo, mano y mitad de cada segmento de los brazos visibles, con su distancia al centro del cuerpo. */
  function skinCheck(L: Limbs3, p: Pose3, label: string) {
    // Los brazos son hijos de la raíz: el aplastado (`volumeScale`) los deforma igual que a la esfera, así que en este
    // espacio la esfera es siempre la de radio 0,5 (escala 1).
    const arms: [V3, V3, V3, number, string][] = [
      [L.shoulderL, L.elbowL, L.handL, p.eL, "L"],
      [L.shoulderR, L.elbowR, L.handR, p.eR, "R"],
    ];
    for (const [S, E, H, e, side] of arms) {
      if (e <= 0.2) continue;
      for (const [name, q] of [["codo", E], ["mano", H], ["brazo", mid(S, E)], ["antebrazo", mid(E, H)]] as const) {
        expect(dist(q, BODY_CENTER), `${label} ${side} ${name}`).toBeGreaterThanOrEqual(SKIN);
      }
    }
  }

  it("M6: ningún brazo atraviesa el cuerpo en 2 ciclos de cada actividad", () => {
    for (const a of ACTIVITIES) {
      runSchedule([{ at: 0, act: a }], 1.5 + 2 * ACTIVITY_PERIOD[a], {}, (f) => {
        if (f.t > 1.5) skinCheck(f.limbs, f.pose, `${a} @${f.t.toFixed(2)}`);
      });
    }
  });

  it("M10: entrar a lift desde read no pliega el brazo izquierdo contra el cuerpo", () => {
    for (let k = 0; k < 5; k++) {
      const sw = 2 + (k / 5) * ACTIVITY_PERIOD.read;
      runSchedule([{ at: 0, act: "read" }, { at: sw, act: "lift" }], sw + 1.5, {}, (f) => {
        if (f.t > sw) skinCheck(f.limbs, f.pose, `read→lift fase ${k} @${(f.t - sw).toFixed(2)}`);
      });
    }
  });

  it("M7: las manos objetivo están al alcance del brazo (hombro→objetivo ≤ (L1+L2)×extensión)", () => {
    for (const a of ACTIVITIES) {
      const T = ACTIVITY_PERIOD[a];
      for (let i = 0; i < 600; i++) {
        const t = (i / 600) * 2 * T;
        const p = computePose3(a, t);
        if (p.eL > 0.2) {
          const d = dist(shoulderAt(1, p.aL), [p.hLx, p.hLy, p.hLz]);
          expect(d, `${a} L @${t.toFixed(2)}`).toBeLessThanOrEqual((L1 + L2) * p.eL);
        }
        if (p.eR > 0.2 && p.curlW < 1) {
          const d = dist(shoulderAt(-1, p.aR), [p.hRx, p.hRy, p.hRz]);
          expect(d, `${a} R @${t.toFixed(2)}`).toBeLessThanOrEqual((L1 + L2) * p.eR);
        }
      }
    }
  });
});

describe("rangos", () => {
  it("60 s con cuadros irregulares (1–50 ms), cambios y toques al azar: todo finito y dentro de rango", () => {
    const rand = rng(42);
    const schedule: { at: number; act: Activity }[] = [{ at: 0, act: "idle" }];
    for (let t = 0.5; t < 60; t += 0.3 + rand() * 4) schedule.push({ at: t, act: ACTIVITIES[Math.floor(rand() * 10)] });
    const pokes = Array.from({ length: 25 }, () => rand() * 60);
    let frames = 0;
    runSchedule(schedule, 60, { pokes, dt: () => 0.001 + rand() * 0.049, look: { x: 0.7, y: -0.4, w: 1 } }, (f) => {
      frames++;
      const p = f.pose;
      for (const [k, v] of Object.entries(p)) expect(Number.isFinite(v), `pose.${k}`).toBe(true);
      for (const v of [...f.limbs.handL, ...f.limbs.handR, ...f.limbs.elbowL, ...f.limbs.elbowR, ...f.props.book, ...f.props.glass, ...f.props.dumbbell]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      // Morphs (lo que el motor pasa a la malla) en [0, 1]
      for (const v of [p.lid, p.smile, p.open, p.oMouth, p.cheeks, p.flex, Math.max(0, -p.brow), Math.max(0, p.brow)]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      const vs = volumeScale(p.sy);
      expect(vs.sy).toBeGreaterThanOrEqual(0.7);
      expect(vs.sy).toBeLessThanOrEqual(1.25);
      expect(vs.sx).toBeGreaterThanOrEqual(0.88);
      expect(vs.sx).toBeLessThanOrEqual(1.2);
      expect(p.glassTilt).toBeGreaterThanOrEqual(0);
      expect(p.glassTilt).toBeLessThanOrEqual(120);
      expect(p.water).toBeGreaterThan(0);
      expect(p.water).toBeLessThanOrEqual(1);
      expect(p.curlW).toBeGreaterThanOrEqual(0);
      expect(p.curlW).toBeLessThanOrEqual(1);
      expect(p.page).toBeGreaterThanOrEqual(0);
      expect(p.page).toBeLessThanOrEqual(180);
    });
    expect(frames).toBeGreaterThan(1000);
  });

  it("M8: las pupilas no se salen del ojo aunque la mirada se pase de rango", () => {
    const out = { x: 0, y: 0 };
    for (const [lx, ly] of [[5, -9], [-3, 3], [Infinity, -Infinity], [NaN, 0.5], [0.4, -0.2]]) {
      pupilOffset3({ ...computePose3("idle", 0), lookX: lx, lookY: ly }, out);
      expect(Number.isFinite(out.x) && Number.isFinite(out.y)).toBe(true);
      expect(Math.abs(out.x)).toBeLessThanOrEqual(0.032);
      expect(Math.abs(out.y)).toBeLessThanOrEqual(0.026);
    }
    pupilOffset3({ ...computePose3("idle", 0), lookX: 0.5, lookY: -0.5 }, out);
    expect(out.x).toBeCloseTo(0.016, 9);
    expect(out.y).toBeCloseTo(0.013, 9);
  });
});

describe("salida natural (M4)", () => {
  afterEach(() => {
    setActivityExitDelay(null);
    resetActivity();
    vi.useRealTimers();
  });

  it("la espera lleva a un punto de salida natural y nunca supera un ciclo", () => {
    for (const a of ACTIVITIES) {
      for (let i = 0; i < 200; i++) {
        const t = 9 + i * 0.013;
        const d = naturalExitDelay(a, t);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(ACTIVITY_PERIOD[a]);
        expect(isNaturalExit(a, t + d), `${a} @${t}`).toBe(true);
        const p = computePose3(a, t + d);
        if (a === "drink") {
          expect(p.aR, `vaso abajo @${t}`).toBeLessThan(0.15);
          expect(p.glassTilt).toBeLessThan(1);
        }
        if (a === "lift") expect(p.curl, `mancuerna abajo @${t}`).toBeLessThan(0.05);
        if (a === "celebrate") expect(p.lift, `ya aterrizó @${t}`).toBe(0);
        if (a === "read") expect(p.page === 0 || p.page === 180, `sin hoja a mitad @${t}`).toBe(true);
      }
    }
  });

  it("drink a los 10 s está con el vaso subiendo: hay que esperar (y no más de un ciclo)", () => {
    expect(isNaturalExit("drink", 10)).toBe(false);
    const d = naturalExitDelay("drink", 10);
    expect(d).toBeGreaterThan(0.5);
    expect(d).toBeLessThan(4.4);
    expect(naturalExitDelay("wave", 10)).toBe(0); // continuas: se cortan enseguida
  });

  it("playActivity espera lo que pide el motor (con tope) y después vuelve al estado por defecto", () => {
    vi.useFakeTimers();
    const asked: Activity[] = [];
    setActivityExitDelay((a) => {
      asked.push(a);
      return 1200;
    });
    playActivity("drink");
    vi.advanceTimersByTime(ACTIVITY_MS + 1100);
    expect(getActivityOverride()).toBe("drink");
    vi.advanceTimersByTime(200);
    expect(getActivityOverride()).toBeNull();
    expect(asked).toEqual(["drink"]);

    setActivityExitDelay(() => 60_000);
    playActivity("lift");
    vi.advanceTimersByTime(ACTIVITY_MS + MAX_EXIT_WAIT_MS + 10);
    expect(getActivityOverride()).toBeNull();
  });

  it("sin motor registrado termina justo a los 10 s, y un toque nuevo sigue reemplazando al anterior", () => {
    vi.useFakeTimers();
    setActivityExitDelay(() => 0);
    playActivity("lift");
    vi.advanceTimersByTime(ACTIVITY_MS + 1);
    expect(getActivityOverride()).toBeNull();
    setActivityExitDelay(() => 3000);
    playActivity("lift");
    vi.advanceTimersByTime(ACTIVITY_MS + 1000);
    playActivity("read"); // durante la espera
    expect(getActivityOverride()).toBe("read");
    vi.advanceTimersByTime(2500);
    expect(getActivityOverride()).toBe("read");
  });
});

describe("mirada al puntero (M5)", () => {
  it("después de ~1,5 s sin puntero se suelta y a los 2 s vuelve a 0", () => {
    const s = createLook3();
    expect(updateLook3(s, 0).w).toBe(0);
    pointLook3(s, 0.8, -0.3, 10);
    expect(updateLook3(s, 10.5)).toMatchObject({ x: 0.8, y: -0.3, w: 1 });
    expect(updateLook3(s, 10 + LOOK_HOLD_S).w).toBe(1);
    const fading = updateLook3(s, 11.7).w;
    expect(fading).toBeGreaterThan(0);
    expect(fading).toBeLessThan(1);
    expect(updateLook3(s, 12)).toMatchObject({ x: 0, y: 0, w: 0 });
  });

  it("acota la mirada a [−1, 1] y en táctil se suelta enseguida al levantar el dedo", () => {
    const s = createLook3();
    pointLook3(s, 4, -7, 0);
    expect(s.x).toBe(1);
    expect(s.y).toBe(-1);
    releaseLook3(s, 0.2);
    expect(updateLook3(s, 0.4).w).toBeLessThan(1);
    expect(updateLook3(s, 0.7)).toMatchObject({ x: 0, y: 0, w: 0 });
    releaseLook3(createLook3(), 1); // sin mirada previa no hace nada
  });

  it("en reposo la mirada vuelve a su vaivén sin saltos mientras se suelta", () => {
    const s = createLook3();
    pointLook3(s, 1, 1, 0);
    let prev = computePose3("idle", 0, updateLook3(s, 0));
    for (let i = 1; i <= 180; i++) {
      const t = i / 60;
      const p = computePose3("idle", t, updateLook3(s, t));
      expect(Math.abs(p.lookX - prev.lookX), `@${t}`).toBeLessThan(0.1);
      expect(Math.abs(p.lookY - prev.lookY), `@${t}`).toBeLessThan(0.1);
      prev = p;
    }
    expect(prev.lookX).toBeCloseTo(computePose3("idle", 3).lookX, 9);
  });
});

describe("página del libro (M3)", () => {
  it("nunca gira para atrás mientras se ve (ciclos de lectura, entrar y salir de read)", () => {
    const sched: { at: number; act: Activity }[] = [{ at: 0, act: "read" }];
    // Salir de read en distintas fases (incluida la vuelta de página) y volver a entrar
    let t = 3 * ACTIVITY_PERIOD.read;
    for (const u of [0.8, 0.85, 0.9, 0.95, 0.3]) {
      const out = t + u * ACTIVITY_PERIOD.read;
      sched.push({ at: out, act: "idle" }, { at: out + 1.2, act: "read" });
      t = out + 1.2 + 2 * ACTIVITY_PERIOD.read;
    }
    let prev: Pose3 | null = null;
    let turned = 0;
    runSchedule(sched, t, {}, (f) => {
      const p = f.pose;
      if (prev && p.page < prev.page - 1e-9) {
        // Solo puede volver cuando la hoja quedó detrás del libro o el libro ya no se ve
        expect(prev.page >= PAGE_HIDDEN || prev.vBook <= 0.03, `vuelve con la hoja visible @${f.t.toFixed(2)}`).toBe(true);
      }
      if (pageVisible(p)) turned = Math.max(turned, p.page);
      prev = { ...p };
    });
    expect(turned).toBeGreaterThan(170); // y la hoja sí da vuelta
  });
});
