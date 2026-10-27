/**
 * Simulador puro del personaje 3D (sin three ni DOM): corre el mismo bucle que el motor (`stepAnimator3`) con
 * una agenda de actividades y devuelve, cuadro a cuadro, la pose del esqueleto, los brazos y los props. Lo usan
 * los tests para medir continuidad, alcance y penetración sin dibujar nada.
 */
import type { Activity } from "./mascot";
import {
  computePose3, createAnimator3, stepAnimator3, type Limbs3, type Look, type Pose3, type Props3, type V3,
} from "./mascot-3d-rig";

export interface SimFrame {
  t: number;
  act: Activity;
  /** Objetivo de ese cuadro (ya mezclado y con el toque) y pose real del esqueleto. */
  target: Pose3;
  pose: Pose3;
  limbs: Limbs3;
  props: Props3;
}

export interface SimOptions {
  fps?: number;
  /** Paso de cada cuadro (s); por defecto 1/fps. Sirve para probar cuadros irregulares. */
  dt?: (i: number) => number;
  /** Instantes (s) en que se toca al personaje. */
  pokes?: number[];
  look?: Look;
}

const cloneV = (v: V3): V3 => [v[0], v[1], v[2]];
const cloneLimbs = (L: Limbs3): Limbs3 => ({
  shoulderL: cloneV(L.shoulderL), shoulderR: cloneV(L.shoulderR), elbowL: cloneV(L.elbowL), elbowR: cloneV(L.elbowR),
  handL: cloneV(L.handL), handR: cloneV(L.handR), scaleL: L.scaleL, scaleR: L.scaleR, bendL: cloneV(L.bendL),
  bendR: cloneV(L.bendR),
});
const cloneProps = (p: Props3): Props3 => ({ dumbbell: cloneV(p.dumbbell), glass: cloneV(p.glass), book: cloneV(p.book) });

/**
 * Corre la agenda (`[{ at, act }]`, ordenada; la primera arranca en t = 0 ya asentada) durante `duration` s y llama
 * a `onFrame` en cada cuadro con objetos que se reutilizan (copiarlos si se guardan).
 */
export function runSchedule(
  schedule: { at: number; act: Activity }[],
  duration: number,
  opts: SimOptions,
  onFrame: (f: SimFrame, i: number) => void,
) {
  const fps = opts.fps ?? 60;
  const first = schedule[0]?.act ?? "idle";
  const an = createAnimator3(first, computePose3(first, 0));
  const pokes = [...(opts.pokes ?? [])].sort((a, b) => a - b);
  let next = 1;
  let p = 0;
  for (let i = 0; an.t < duration; i++) {
    const dt = opts.dt ? opts.dt(i) : 1 / fps;
    const tNext = an.t + dt;
    while (next < schedule.length && schedule[next].at <= tNext) next++;
    const wanted = schedule[next - 1].act;
    let poke = false;
    while (p < pokes.length && pokes[p] <= tNext) {
      poke = true;
      p++;
    }
    stepAnimator3(an, dt, wanted, opts.look, poke);
    onFrame({ t: an.t, act: an.act, target: an.target, pose: an.rig.pose, limbs: an.limbs, props: an.props }, i);
  }
}

/** Pasa de `fromAct` a `toAct` a los `switchAt` s y devuelve todos los cuadros (copiados). */
export function simulate(
  fromAct: Activity,
  toAct: Activity,
  switchAt: number,
  duration: number,
  fps = 60,
  opts: Omit<SimOptions, "fps"> = {},
): SimFrame[] {
  const frames: SimFrame[] = [];
  runSchedule([{ at: 0, act: fromAct }, { at: switchAt, act: toAct }], duration, { ...opts, fps }, (f) =>
    frames.push({
      t: f.t, act: f.act, target: { ...f.target }, pose: { ...f.pose }, limbs: cloneLimbs(f.limbs), props: cloneProps(f.props),
    }),
  );
  return frames;
}
