/**
 * Slime: motor de animación (matemática pura, sin React ni DOM).
 *
 * - Cuerpo gelatinoso: contorno de N puntos con resortes amortiguados acoplados entre vecinos.
 *   Se excita con las aceleraciones del cuerpo (saltos, aterrizajes, giros), así que tiembla y
 *   "chapotea" solo; la forma conserva ~volumen (aplastar ensancha, estirar adelgaza).
 * - Brazos: pseudópodos que salen del cuerpo (extensión 0–1) con cinemática inversa de dos
 *   segmentos; el brazo del gimnasio usa un codo fijo (curl) y un bíceps que se infla.
 * - `computePose`: pose objetivo de cada actividad en función del tiempo; `stepRig` la suaviza.
 */
import type { Activity } from "./mascot";

export type V = [number, number];

export const GROUND = 146;
/** Semiancho y alto del cuerpo en reposo. */
export const W = 44;
export const H = 62;
export const ARM = { l1: 20, l2: 22 };
export const POINTS = 13;

export const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const seg = (u: number, a: number, b: number) => clamp((u - a) / (b - a), 0, 1);
export const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
export const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
export const lerpV = (a: V, b: V, t: number): V => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** Dos segmentos hasta `target`; `bend` elige el lado del codo. La mano queda lo más cerca posible. */
export function twoBoneIK(shoulder: V, target: V, l1: number, l2: number, bend: 1 | -1) {
  const dx = target[0] - shoulder[0];
  const dy = target[1] - shoulder[1];
  const d = Math.hypot(dx, dy) || 1e-6;
  const reach = clamp(d, Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  const ux = dx / d;
  const uy = dy / d;
  const a = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const px = shoulder[0] + ux * a;
  const py = shoulder[1] + uy * a;
  return {
    joint: [px - uy * h * bend, py + ux * h * bend] as V,
    end: [shoulder[0] + ux * reach, shoulder[1] + uy * reach] as V,
  };
}

/** Elige la solución con el codo más bajo y hacia afuera (la natural para un brazo que cuelga). */
export function ikNatural(shoulder: V, target: V, outward: 1 | -1, l1 = ARM.l1, l2 = ARM.l2) {
  const a = twoBoneIK(shoulder, target, l1, l2, 1);
  const b = twoBoneIK(shoulder, target, l1, l2, -1);
  const score = (j: V) => j[1] * 0.7 + outward * (j[0] - shoulder[0]) * 0.5;
  return score(a.joint) >= score(b.joint) ? a : b;
}

export interface Pose {
  /** Centro horizontal y altura del cuerpo sobre el suelo (px, + arriba). */
  bx: number;
  lift: number;
  sx: number;
  sy: number;
  /** Inclinación (grados, + hacia la derecha). */
  tilt: number;
  /** Mirada (−1…1), párpados (0 abierto … 1 cerrado), cejas (−1 fruncidas … +1 levantadas). */
  lookX: number;
  lookY: number;
  lid: number;
  brow: number;
  mouthW: number;
  mouthC: number;
  mouthO: number;
  /** Extensión de cada brazo (0 = metido en el cuerpo, 1 = afuera) y mano objetivo absoluta. */
  armLe: number;
  armRe: number;
  handLx: number;
  handLy: number;
  handRx: number;
  handRy: number;
  /** Curl del brazo derecho: ángulo del antebrazo (0 = abajo … 1 = arriba) y bíceps inflado (0–1). */
  curl: number;
  flex: number;
  glassTilt: number;
  water: number;
  page: number;
}

export const REST: Pose = {
  bx: 80,
  lift: 0,
  sx: 1,
  sy: 1,
  tilt: 0,
  lookX: 0,
  lookY: 0,
  lid: 0,
  brow: 0.2,
  mouthW: 9,
  mouthC: 7,
  mouthO: 0,
  armLe: 0,
  armRe: 0,
  handLx: 28,
  handLy: 128,
  handRx: 132,
  handRy: 128,
  curl: -1, // -1 = no se usa el modo curl
  flex: 0,
  glassTilt: 0,
  water: 1,
  page: 0,
};

/** Parpadeo natural: un cierre breve cada ~4,3 s y un doble parpadeo ocasional. */
export function blink(t: number): number {
  if (!(t >= 0)) return 0;
  const c = t % 4.3;
  if (c < 0.14) return Math.sin((c / 0.14) * Math.PI);
  const d = t % 11.7;
  if (d > 0.3 && d < 0.44) return Math.sin(((d - 0.3) / 0.14) * Math.PI);
  return 0;
}

export interface Look {
  x: number;
  y: number;
}

/** Rotación de un punto alrededor de la base del cuerpo. */
function rotAbout(p: V, c: V, deg: number): V {
  const r = (deg * Math.PI) / 180;
  const x = p[0] - c[0];
  const y = p[1] - c[1];
  return [c[0] + x * Math.cos(r) - y * Math.sin(r), c[1] + x * Math.sin(r) + y * Math.cos(r)];
}

export function shoulders(p: Pick<Pose, "bx" | "lift" | "sx" | "sy" | "tilt">): { L: V; R: V } {
  const baseY = GROUND - p.lift;
  const c: V = [p.bx, baseY];
  const y = baseY - H * p.sy * 0.4;
  const dx = W * p.sx * 0.86;
  return { L: rotAbout([p.bx - dx, y], c, p.tilt), R: rotAbout([p.bx + dx, y], c, p.tilt) };
}

/** Pose objetivo de una actividad en el instante `t` (segundos). */
export function computePose(activity: Activity, t: number, look: Look = { x: 0, y: 0 }): Pose {
  const p: Pose = { ...REST };
  const br = Math.sin(t * 2.1);
  p.sy = 1 + br * 0.02;
  p.sx = 1 - br * 0.01;
  p.lid = blink(t);

  switch (activity) {
    case "wave": {
      p.tilt = -2 + Math.sin(t * 1.4) * 0.6;
      p.armRe = 1;
      p.handRx = 80 + 60 + Math.sin(t * 6) * 5;
      p.handRy = GROUND - 84 + Math.sin(t * 3) * 2.5;
      p.brow = 0.5;
      p.mouthC = 9;
      p.mouthW = 10;
      p.lookX = look.x * 0.6;
      break;
    }
    case "lift": {
      // Curl de bíceps con mancuerna: anticipación, subida con esfuerzo, sostén con temblor, bajada lenta.
      const T = 3.4;
      const u = (t % T) / T;
      const up = u < 0.12 ? 0 : u < 0.45 ? easeInOut(seg(u, 0.12, 0.45)) : u < 0.58 ? 1 : u < 0.9 ? 1 - easeInOut(seg(u, 0.58, 0.9)) : 0;
      const effort = u > 0.14 && u < 0.58 ? 1 : 0;
      p.armRe = 1;
      p.curl = up;
      p.flex = clamp(seg(u, 0.3, 0.46) * (u < 0.7 ? 1 : 1 - seg(u, 0.7, 0.9)), 0, 1);
      p.tilt = -2.5 * up;
      p.sx = 1 + up * 0.03 - (u < 0.12 ? 0.02 : 0);
      p.sy = 1 - up * 0.02 + (u < 0.12 ? 0.012 : 0);
      p.lid = effort ? 0.7 : blink(t);
      p.brow = effort ? -0.55 : 0.2;
      p.mouthW = effort ? 10 : 9;
      p.mouthC = effort ? 2 : 7;
      p.mouthO = effort ? 2.5 : 0;
      p.lookX = 0.4 * up;
      p.lookY = -0.1 * up;
      // Mano izquierda: retraída (el protagonista es un solo brazo)
      p.armLe = 0;
      break;
    }
    case "drink": {
      const T = 4.4;
      const u = (t % T) / T;
      const up = easeInOut(seg(u, 0, 0.28)) - easeInOut(seg(u, 0.62, 0.86));
      p.armRe = 1;
      p.handRx = lerp(80 + 52, 80 + 17, up);
      p.handRy = lerp(GROUND - 34, GROUND - 52, up);
      p.glassTilt = lerp(0, 50, easeInOut(seg(u, 0.3, 0.52)) - easeInOut(seg(u, 0.6, 0.7)));
      p.water = 1 - 0.62 * easeInOut(seg(u, 0.32, 0.6)) + 0.62 * seg(u, 0.9, 1);
      p.tilt = -4 * easeInOut(seg(u, 0.28, 0.46)) * (1 - easeInOut(seg(u, 0.6, 0.72)));
      const gulp = u > 0.44 && u < 0.62 ? Math.max(0, Math.sin((u - 0.44) * 70)) : 0;
      p.sy = 1 + br * 0.012 + gulp * 0.02;
      p.sx = 1 - gulp * 0.015;
      p.lookY = -0.5 * up;
      p.lid = u > 0.4 && u < 0.58 ? 0.85 : blink(t);
      p.mouthC = u > 0.3 && u < 0.6 ? 1 : u > 0.8 ? 12 : 7;
      p.brow = u > 0.8 ? 0.7 : 0.1;
      break;
    }
    case "read": {
      p.armLe = 1;
      p.armRe = 1;
      p.handLx = 80 - 21;
      p.handRx = 80 + 21;
      p.handLy = GROUND - 30 + Math.sin(t * 1.3) * 0.8;
      p.handRy = GROUND - 30 + Math.sin(t * 1.3 + 0.4) * 0.8;
      const scan = (t * 0.9) % 1;
      p.lookX = lerp(-0.7, 0.7, scan);
      p.lookY = 0.55;
      p.page = Math.sin(((t % 3.4) / 3.4) * Math.PI * 2) > 0.92 ? Math.sin((t % 3.4) * 9) : 0;
      p.sy = 0.97 + br * 0.015;
      p.tilt = Math.sin(t * 0.8) * 1;
      p.brow = 0.5;
      p.mouthC = 8;
      break;
    }
    case "meditate": {
      const b = Math.sin(t * 1.15);
      p.lift = 2 + Math.sin(t * 0.6) * 1.5; // levita apenas
      p.sy = 0.92 + b * 0.025;
      p.sx = 1.06 - b * 0.015;
      p.lid = 1;
      p.brow = 0.3;
      p.mouthW = 7;
      p.mouthC = 5;
      break;
    }
    case "run": {
      // Los slimes corren dando saltitos: estira al despegar, aplasta al caer, inclinado hacia adelante.
      const f = (t * 2.0) % 1;
      const air = Math.sin(f * Math.PI);
      p.lift = Math.max(0, air) * 9;
      p.sy = f < 0.12 ? 0.92 : 1 + air * 0.07;
      p.sx = f < 0.12 ? 1.07 : 1 - air * 0.035;
      p.tilt = 5;
      p.bx = 80 + Math.sin(t * 2.0 * Math.PI) * 1.5;
      p.armLe = 0.7;
      p.armRe = 0.7;
      p.handLx = 80 - 56 + Math.sin(f * Math.PI * 2) * 6;
      p.handLy = GROUND - 44 + Math.cos(f * Math.PI * 2) * 3;
      p.handRx = 80 + 56 - Math.sin(f * Math.PI * 2) * 6;
      p.handRy = GROUND - 44 - Math.cos(f * Math.PI * 2) * 3;
      p.brow = 0.3;
      p.mouthC = 8;
      p.mouthO = 3;
      p.lookX = 0.3;
      break;
    }
    case "sleep": {
      const b = Math.sin(t * 0.95);
      p.sy = 0.86 + b * 0.03;
      p.sx = 1.08 - b * 0.015;
      p.tilt = 5;
      p.lid = 1;
      p.brow = 0;
      p.mouthW = 4.5;
      p.mouthC = 2;
      p.mouthO = 4 + b * 1.5;
      break;
    }
    case "dance": {
      const psi = t * Math.PI * 2 * 1.6;
      const s = Math.sin(psi);
      p.lift = Math.abs(s) * 5;
      p.sy = 1 + Math.abs(Math.cos(psi)) * 0.035 - Math.abs(s) * 0.015;
      p.sx = 1 - Math.abs(Math.cos(psi)) * 0.02;
      p.tilt = s * 3.5;
      p.bx = 80 + s * 2;
      p.armLe = 1;
      p.armRe = 1;
      p.handLx = 80 - 58;
      p.handLy = GROUND - 56 + s * 16;
      p.handRx = 80 + 58;
      p.handRy = GROUND - 56 - s * 16;
      p.brow = 0.5;
      p.mouthC = 9;
      p.mouthO = 3;
      p.lookX = s * 0.4;
      break;
    }
    case "celebrate": {
      // Agacharse, saltar estirado con los brazos arriba, aplastarse al caer y festejar.
      const T = 2.6;
      const u = (t % T) / T;
      const crouch = easeInOut(seg(u, 0, 0.2)) * (1 - seg(u, 0.2, 0.25));
      const air = u > 0.2 && u < 0.52 ? Math.sin(((u - 0.2) / 0.32) * Math.PI) : 0;
      const land = u >= 0.52 && u < 0.66 ? Math.sin(((u - 0.52) / 0.14) * Math.PI) : 0;
      p.lift = air * 26;
      p.sy = 1 - crouch * 0.1 + air * 0.09 - land * 0.12;
      p.sx = 1 + crouch * 0.08 - air * 0.045 + land * 0.1;
      const cheer = u > 0.18 ? 1 : 0.15;
      p.armLe = cheer;
      p.armRe = cheer;
      p.handLx = 80 - 52 - cheer * 4 + Math.sin(t * 8) * 2 * cheer;
      p.handLy = GROUND - 46 - cheer * 40 + Math.sin(t * 8) * 1.5;
      p.handRx = 80 + 52 + cheer * 4 - Math.sin(t * 8) * 2 * cheer;
      p.handRy = GROUND - 46 - cheer * 40 - Math.sin(t * 8) * 1.5;
      p.brow = 0.6;
      p.mouthW = 11;
      p.mouthC = 5;
      p.mouthO = 7;
      p.lid = 0;
      break;
    }
    default: {
      // Reposo vivo: respira, se balancea, mira alrededor (o al usuario) y de vez en cuando da un saltito.
      p.bx += Math.sin(t * 0.8) * 1.4;
      p.tilt = Math.sin(t * 0.8) * 1.2;
      p.lookX = look.x !== 0 || look.y !== 0 ? look.x : Math.sin(t * 0.55) * 0.6;
      p.lookY = look.x !== 0 || look.y !== 0 ? look.y : Math.sin(t * 0.37) * 0.25;
      p.brow = 0.2 + Math.max(0, Math.sin(t * 0.7)) * 0.3;
      const hop = (t % 7.5) / 7.5;
      if (hop < 0.1) {
        const k = hop / 0.1;
        p.sy -= Math.sin(Math.min(1, k * 2) * Math.PI) * 0.04;
        p.sx += Math.sin(Math.min(1, k * 2) * Math.PI) * 0.035;
        p.lift = k > 0.4 ? Math.sin(((k - 0.4) / 0.6) * Math.PI) * 5 : 0;
      }
      break;
    }
  }
  return p;
}

const K: Partial<Record<keyof Pose, number>> = {
  bx: 14, lift: 26, sx: 24, sy: 24, tilt: 14,
  lookX: 10, lookY: 10, brow: 14, mouthW: 16, mouthC: 16, mouthO: 18,
  armLe: 14, armRe: 14, handLx: 16, handLy: 16, handRx: 16, handRy: 16,
  curl: 20, flex: 18, glassTilt: 14, water: 12, page: 40,
};
const DIRECT = new Set<keyof Pose>(["lid"]);

/** Avanza la pose real hacia la objetivo con resortes amortiguados (los cambios se mezclan). */
export function stepRig(current: Pose, target: Pose, dt: number): Pose {
  const next = { ...current };
  for (const key of Object.keys(target) as (keyof Pose)[]) {
    if (DIRECT.has(key)) {
      next[key] = target[key];
      continue;
    }
    // `curl` vale -1 cuando no se usa: se corta sin interpolar para no "pasar" por poses raras.
    if (key === "curl" && (current.curl < 0 || target.curl < 0)) {
      next.curl = target.curl;
      continue;
    }
    const k = K[key] ?? 14;
    next[key] = current[key] + (target[key] - current[key]) * (1 - Math.exp(-k * dt));
  }
  return next;
}

// ---------------------------------------------------------------------------------------------
// Gelatina
// ---------------------------------------------------------------------------------------------

export interface Jelly {
  /** Desplazamiento de cada punto del contorno a lo largo de su normal (px) y su velocidad. */
  o: number[];
  v: number[];
  /** Estado para derivar aceleraciones del cuerpo. */
  prevLift: number;
  prevLiftV: number;
  prevBx: number;
  prevBxV: number;
}

export const createJelly = (p: Pose = REST): Jelly => ({
  o: Array(POINTS).fill(0),
  v: Array(POINTS).fill(0),
  prevLift: p.lift,
  prevLiftV: 0,
  prevBx: p.bx,
  prevBxV: 0,
});

const angle = (i: number) => Math.PI - (i / (POINTS - 1)) * Math.PI; // de izquierda (π) a derecha (0)

const STIFF = 190;
const DAMP = 6.5;
const DIFFUSE = 70;
const GAIN = 0.003;

/**
 * Integra los resortes del contorno. Las aceleraciones verticales y laterales del cuerpo (saltos,
 * aterrizajes, bamboleo) empujan los puntos en sentido contrario a la inercia: la gelatina "queda atrás".
 */
export function stepJelly(j: Jelly, p: Pose, dt: number): Jelly {
  const liftV = (p.lift - j.prevLift) / dt;
  const bxV = (p.bx - j.prevBx) / dt;
  const ay = clamp((liftV - j.prevLiftV) / dt, -9000, 9000);
  const ax = clamp((bxV - j.prevBxV) / dt, -9000, 9000);

  const o = j.o.slice();
  const v = j.v.slice();
  // Subpasos para mantener estable el resorte con dt grandes
  const steps = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    for (let i = 0; i < POINTS; i++) {
      const a = angle(i);
      const edge = i === 0 || i === POINTS - 1 ? 0.25 : 1; // las puntas pegadas al suelo se mueven poco
      const nUp = Math.sin(a);
      const nRight = Math.cos(a);
      const left = o[Math.max(0, i - 1)];
      const right = o[Math.min(POINTS - 1, i + 1)];
      const drive = -(ay * nUp + ax * nRight * 0.6) * GAIN * edge;
      const acc = -STIFF * o[i] - DAMP * v[i] + DIFFUSE * (left + right - 2 * o[i]) + drive * STIFF;
      v[i] += acc * h;
    }
    for (let i = 0; i < POINTS; i++) o[i] = clamp(o[i] + v[i] * h, -16, 16);
  }
  return { o, v, prevLift: p.lift, prevLiftV: liftV, prevBx: p.bx, prevBxV: bxV };
}

/** Puntos del contorno superior (de izquierda a derecha), con la forma de la pose y la gelatina aplicadas. */
export function outline(p: Pose, j: Jelly): V[] {
  const baseY = GROUND - p.lift;
  const c: V = [p.bx, baseY];
  const pts: V[] = [];
  for (let i = 0; i < POINTS; i++) {
    const a = angle(i);
    const sin = Math.sin(a);
    const x = W * p.sx * Math.cos(a);
    const y = -H * p.sy * Math.pow(Math.max(0, sin), 0.88);
    // Normal aproximada hacia afuera
    const nx = Math.cos(a);
    const ny = -Math.sin(a);
    const off = j.o[i];
    pts.push(rotAbout([p.bx + x + nx * off, baseY + y + ny * off], c, p.tilt));
  }
  return pts;
}

/** Path suave (Catmull-Rom → cúbicas) por los puntos, cerrado por una base levemente curva. */
export function bodyPath(pts: V[], p: Pose): string {
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1: V = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: V = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  const first = pts[0];
  const baseY = GROUND - p.lift;
  d += ` Q${f(p.bx)} ${f(baseY + 6 * Math.min(1.4, p.sx))} ${f(first[0])} ${f(first[1])}Z`;
  return d;
}

export interface Arms {
  shoulderL: V;
  shoulderR: V;
  elbowL: V;
  elbowR: V;
  handL: V;
  handR: V;
  /** Brazo derecho en modo curl: centro del bíceps. */
  bicep: V;
}

/** Resuelve ambos brazos: a mitad de camino entre el hombro y la mano según la extensión. */
export function solveArms(p: Pose): Arms {
  const s = shoulders(p);
  const reach = (S: V, target: V, e: number): V => lerpV(S, target, clamp(e, 0, 1));

  // Brazo izquierdo (IK natural)
  const hl = reach(s.L, [p.handLx, p.handLy], p.armLe);
  const L = ikNatural(s.L, hl, -1);

  // Brazo derecho: curl (codo fijo) o IK natural
  let elbowR: V;
  let handR: V;
  let bicep: V = lerpV(s.R, s.R, 0);
  if (p.curl >= 0) {
    const E: V = [s.R[0] + 9, s.R[1] + 19];
    const phi = p.curl * (160 * Math.PI) / 180;
    elbowR = E;
    handR = [E[0] + ARM.l2 * (Math.sin(phi) * 0.45 + 0.06), E[1] + ARM.l2 * Math.cos(phi)];
    bicep = [lerp(s.R[0], E[0], 0.5) + 2, lerp(s.R[1], E[1], 0.5) - 2];
  } else {
    const hr = reach(s.R, [p.handRx, p.handRy], p.armRe);
    const R = ikNatural(s.R, hr, 1);
    elbowR = R.joint;
    handR = R.end;
  }
  return { shoulderL: s.L, shoulderR: s.R, elbowL: L.joint, elbowR, handL: L.end, handR, bicep };
}
