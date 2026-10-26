/**
 * Animación procedural del personaje 3D (matemática PURA: sin three ni DOM).
 *
 * El modelo se anima moviendo directamente sus nodos (cuerpo, cara, brazos, props) en vez de usar los
 * clips del archivo. Acá viven:
 * - `twoBoneIK3`: cinemática inversa de dos segmentos en 3D (hombro→codo→mano) con vector polo.
 * - `computePose3`: pose objetivo de cada actividad en función del tiempo (anticipación, esfuerzo,
 *   respiración, parpadeo, mirada).
 * - `stepRig3`: sigue la pose objetivo con resortes (rebote al aterrizar) y suavizado exponencial.
 * - `solveLimbs3`: resuelve ambos brazos (con pseudópodos que salen por el costado o el frente).
 *
 * Espacio: el de la raíz del modelo (Y arriba, +Z hacia la cámara). La esfera tiene su origen en la base:
 * centro (0, 0.5, 0), radio 0.5. El brazo L (+x) queda a la derecha de la pantalla; el R (−x), a la izquierda.
 */
import type { Activity } from "./mascot";

export type V3 = [number, number, number];

// --- Geometría del modelo (medida del GLB) ---
export const BODY_CENTER: V3 = [0, 0.5, 0];
/** Radio donde nacen los brazos. */
export const SHOULDER_R = 0.46;
/** Escala de los brazos y separación entre segmentos: con los valores del archivo quedan muy cortos. */
export const ARM_SCALE = 2.2;
export const SEG_SPACING = 1.2;
export const SEG1 = 0.1 * SEG_SPACING;
export const SEG2 = 0.09 * SEG_SPACING;
/** Largo de cada segmento con el brazo totalmente extendido (en el espacio de la raíz). */
export const L1 = SEG1 * ARM_SCALE;
export const L2 = SEG2 * ARM_SCALE;

export const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const seg = (u: number, a: number, b: number) => clamp((u - a) / (b - a), 0, 1);
export const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a) || 1e-9;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const dist = (a: V3, b: V3) => len(sub(a, b));

/**
 * Dos segmentos de largos `l1` y `l2` desde `shoulder` hasta `target`. El codo se dobla hacia `pole`
 * (el componente del polo perpendicular al eje hombro→mano). Si el objetivo no se alcanza, el brazo
 * queda estirado hacia él.
 */
export function twoBoneIK3(shoulder: V3, target: V3, l1: number, l2: number, pole: V3) {
  const d = sub(target, shoulder);
  const dl = len(d) || 1e-9;
  const dir = mul(d, 1 / dl);
  const reach = clamp(dl, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const a = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let perp = sub(pole, mul(dir, dot(pole, dir)));
  if (len(perp) < 1e-6) perp = sub([0, -1, 0], mul(dir, dot([0, -1, 0], dir)));
  perp = norm(perp);
  const elbow = add(add(shoulder, mul(dir, a)), mul(perp, h));
  return { elbow, hand: add(shoulder, mul(dir, reach)) };
}

export interface Pose3 {
  /** Altura del cuerpo sobre el piso (unidades del modelo) y aplastado/estirado vertical (el resto se compensa). */
  lift: number;
  sy: number;
  /** Inclinaciones en grados: rotZ (lado), rotX (adelante/atrás), rotY (giro). */
  rotZ: number;
  rotX: number;
  rotY: number;
  /** Cara: mirada (−1…1), párpados (0…1), cejas (−1 fruncidas…+1 levantadas), boca y mejillas (0…1). */
  lookX: number;
  lookY: number;
  lid: number;
  brow: number;
  smile: number;
  open: number;
  oMouth: number;
  cheeks: number;
  /** Brazos: extensión (0 = escondido en el cuerpo), azimut del hombro (0 = costado, ~1 = al frente) y mano objetivo. */
  eL: number;
  eR: number;
  aL: number;
  aR: number;
  hLx: number;
  hLy: number;
  hLz: number;
  hRx: number;
  hRy: number;
  hRz: number;
  /** Curl del brazo derecho: antebrazo (0 abajo…1 arriba; −1 = no se usa) y bíceps inflado (0–1). */
  curl: number;
  flex: number;
  /** Props: visibilidad (0–1), inclinación del vaso (grados), agua, página del libro (grados) y destellos. */
  vDumbbell: number;
  vGlass: number;
  vBook: number;
  glassTilt: number;
  water: number;
  page: number;
  fx: number;
}

export const REST3: Pose3 = {
  lift: 0, sy: 1, rotZ: 0, rotX: 0, rotY: 0,
  lookX: 0, lookY: 0, lid: 0, brow: 0.2, smile: 0.6, open: 0, oMouth: 0, cheeks: 0.35,
  eL: 0.75, eR: 0.75, aL: 0.05, aR: 0.05,
  hLx: 0.56, hLy: 0.2, hLz: 0.12, hRx: -0.56, hRy: 0.2, hRz: 0.12,
  curl: -1, flex: 0,
  vDumbbell: 0, vGlass: 0, vBook: 0, glassTilt: 0, water: 1, page: 0, fx: 0,
};

/** Parpadeo natural; SIEMPRE entre 0 y 1 (un tiempo negativo o inválido da 0). */
export function blink3(t: number): number {
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

/** Posición del hombro dado el azimut (0 = costado, ~1.1 = adelante). `side`: +1 = L (+x), −1 = R (−x). */
export function shoulderAt(side: 1 | -1, azimuth: number): V3 {
  return [side * SHOULDER_R * Math.cos(azimuth), 0.48, SHOULDER_R * Math.sin(azimuth) + 0.02];
}

/** Dirección de un antebrazo del curl: 0 = colgando, 1 = doblado hacia el hombro (un poco hacia el frente). */
export function curlDirection(curl: number): V3 {
  const phi = clamp(curl, 0, 1) * ((155 * Math.PI) / 180);
  return norm([-0.22 * Math.sin(phi), -Math.cos(phi), 0.5 * Math.sin(phi)]);
}

/** Codo fijo del curl (cerca de las costillas, apenas hacia el frente). */
export function curlElbow(shoulder: V3, elbowLen: number): V3 {
  return add(shoulder, mul(norm([-0.2, -0.95, 0.28]), elbowLen));
}

const rad = (deg: number) => (deg * Math.PI) / 180;
export { rad };

/**
 * Pose objetivo de una actividad en el instante `t` (s). `pokeT` = segundos desde el último toque (−1 = ninguno).
 *
 * Regla de diseño: cada actividad tiene UN movimiento principal con una fase maestra (`u` del ciclo o `psi`);
 * todo lo secundario (respiración, balanceo, mirada, cola de los brazos) se deriva de esa misma fase y con poca
 * amplitud, nunca de relojes independientes. Solo el reposo usa el puntero (`look`) y sus detalles propios.
 */
export function computePose3(activity: Activity, t: number, look: Look = { x: 0, y: 0 }, pokeT = -1): Pose3 {
  const p: Pose3 = { ...REST3 };
  p.lid = blink3(t);

  switch (activity) {
    case "wave": {
      // Fase maestra: el saludo (1,8 Hz). El leve balanceo del cuerpo va con la misma fase.
      const psi = t * Math.PI * 2 * 1.8;
      const s = Math.sin(psi);
      p.sy = 1 + 0.006 * Math.cos(psi);
      p.rotZ = -2 - 0.8 * s;
      p.eL = 1;
      p.aL = 0.12;
      p.hLx = 0.66 + 0.07 * s;
      p.hLy = 0.9 + 0.02 * Math.cos(psi);
      p.hLz = 0.14;
      p.eR = 0.6;
      p.brow = 0.7;
      p.smile = 0.95;
      p.cheeks = 0.6;
      break;
    }
    case "lift": {
      // Curl de bíceps con UN brazo (el derecho): anticipación, subida con esfuerzo, sostén con temblor, bajada lenta.
      const T = 3.4;
      const u = (t % T) / T;
      const up = u < 0.12 ? 0 : u < 0.45 ? easeInOut(seg(u, 0.12, 0.45)) : u < 0.58 ? 1 : u < 0.9 ? 1 - easeInOut(seg(u, 0.58, 0.9)) : 0;
      const effort = u > 0.14 && u < 0.58 ? 1 : 0;
      p.eR = 1;
      p.eL = 0;
      p.aR = 0.28;
      p.curl = up + (u > 0.45 && u < 0.58 ? Math.sin(u * Math.PI * 2 * 20) * 0.012 : 0);
      p.flex = clamp(seg(u, 0.3, 0.46) * (u < 0.7 ? 1 : 1 - seg(u, 0.7, 0.9)), 0, 1);
      p.rotZ = -3 * up;
      p.rotY = 8 * up;
      p.sy = 1 - up * 0.02 - (u < 0.12 ? 0.03 * (1 - seg(u, 0, 0.12)) : 0);
      p.lid = effort ? 0.55 : blink3(t);
      p.brow = effort ? -0.6 : 0.2;
      p.smile = effort ? 0.05 : 0.6;
      p.open = effort ? 0.18 : 0;
      p.cheeks = effort ? 0.7 : 0.35;
      p.lookX = -0.35 * up;
      p.lookY = -0.1 * up;
      p.vDumbbell = 1;
      p.fx = u > 0.42 && u < 0.62 ? 1 : 0;
      break;
    }
    case "drink": {
      const T = 4.4;
      const u = (t % T) / T;
      const up = easeInOut(seg(u, 0, 0.28)) - easeInOut(seg(u, 0.62, 0.86));
      p.eR = 1;
      p.aR = lerp(0.1, 0.95, up);
      p.hRx = lerp(-0.58, -0.1, up);
      p.hRy = lerp(0.22, 0.32, up);
      p.hRz = lerp(0.12, 0.62, up);
      p.glassTilt = lerp(0, 55, easeInOut(seg(u, 0.3, 0.52)) - easeInOut(seg(u, 0.6, 0.7)));
      p.water = 1 - 0.62 * easeInOut(seg(u, 0.32, 0.6)) + 0.62 * seg(u, 0.9, 1);
      p.rotX = -5 * easeInOut(seg(u, 0.28, 0.46)) * (1 - easeInOut(seg(u, 0.6, 0.72)));
      const gulp = u > 0.44 && u < 0.62 ? Math.max(0, Math.sin((u - 0.44) * 70)) : 0;
      p.sy = 1 + gulp * 0.02;
      p.lookY = 0.5 * up;
      p.lid = u > 0.4 && u < 0.58 ? 0.85 : blink3(t);
      p.smile = u > 0.8 ? 0.95 : u > 0.3 && u < 0.6 ? 0.1 : 0.55;
      p.open = u > 0.3 && u < 0.6 ? 0.12 : 0;
      p.brow = u > 0.8 ? 0.7 : 0.1;
      p.vGlass = 1;
      p.eL = 0.7;
      break;
    }
    case "read": {
      // Fase maestra: el ciclo de lectura (barrido de la mirada y vuelta de página). Balanceo y respiración van con ella.
      const T = 3.4;
      const u = (t % T) / T;
      const ph = Math.sin(u * Math.PI * 2);
      p.eL = 1;
      p.eR = 1;
      p.aL = 0.95;
      p.aR = 0.95;
      p.hLx = 0.17;
      p.hRx = -0.17;
      p.hLy = p.hRy = 0.3 + ph * 0.006;
      p.hLz = p.hRz = 0.66;
      p.lookX = lerp(-0.7, 0.7, seg(u, 0, 0.76));
      p.lookY = 0.55;
      p.page = seg(u, 0.76, 0.91) * 180;
      p.rotZ = 0.6 * ph;
      p.sy = 0.985 + 0.01 * ph;
      p.brow = 0.45;
      p.smile = 0.35;
      p.vBook = 1;
      break;
    }
    case "meditate": {
      // Fase maestra: la respiración (todo lo demás va con ella).
      const b = Math.sin(t * 1.15);
      p.lift = 0.012 + 0.012 * b;
      p.sy = 0.88 + b * 0.04;
      p.lid = 1;
      p.brow = 0.3;
      p.smile = 0.3;
      p.cheeks = 0.5;
      // Manos juntas frente al pecho, codos hacia abajo y afuera
      p.aL = p.aR = 0.95;
      p.eL = p.eR = 0.85;
      p.hLx = 0.06;
      p.hRx = -0.06;
      p.hLy = p.hRy = 0.27;
      p.hLz = p.hRz = 0.62;
      break;
    }
    case "run": {
      // Fase maestra: la zancada f. El aplastado al aterrizar decae dentro del mismo ciclo.
      const f = (t * 2.0) % 1;
      const air = Math.sin(f * Math.PI);
      p.lift = Math.max(0, air) * 0.06;
      p.sy = 1 + 0.04 * air - 0.05 * Math.exp(-14 * f);
      p.rotZ = -3;
      p.rotX = 5;
      p.aL = p.aR = 0.35;
      p.eL = p.eR = 0.9;
      const sw = Math.sin(f * Math.PI * 2);
      p.hLx = 0.6;
      p.hRx = -0.6;
      p.hLy = p.hRy = 0.34;
      p.hLz = 0.14 + sw * 0.14;
      p.hRz = 0.14 - sw * 0.14;
      p.brow = 0.35;
      p.smile = 0.8;
      p.open = 0.3;
      p.lookX = 0.25;
      break;
    }
    case "sleep": {
      // Fase maestra: la respiración lenta.
      const b = Math.sin(t * 0.95);
      p.sy = 0.84 + b * 0.03;
      p.rotZ = 9;
      p.lid = 1;
      p.brow = 0;
      p.smile = 0.15;
      p.oMouth = 0.5 + b * 0.2;
      p.eL = p.eR = 0.6;
      p.hLx = 0.5;
      p.hRx = -0.5;
      p.hLy = p.hRy = 0.15;
      p.hLz = p.hRz = 0.2;
      break;
    }
    case "dance": {
      // Fase maestra: el compás (1,6 Hz). Rebote, balanceo, brazos y mirada salen de la misma fase.
      const psi = t * Math.PI * 2 * 1.6;
      const s = Math.sin(psi);
      p.lift = Math.abs(s) * 0.035;
      p.sy = 1 + Math.abs(Math.cos(psi)) * 0.03;
      p.rotZ = s * 4;
      p.aL = p.aR = 0.18;
      p.eL = p.eR = 1;
      p.hLx = 0.64;
      p.hRx = -0.64;
      p.hLy = 0.7 + 0.16 * s;
      p.hRy = 0.7 - 0.16 * s;
      p.hLz = p.hRz = 0.12;
      p.brow = 0.55;
      p.smile = 0.9;
      p.open = 0.3;
      p.lookX = s * 0.4;
      break;
    }
    case "celebrate": {
      // Agacharse, saltito, aterrizaje con aplastamiento y festejo (todo del mismo ciclo u).
      const T = 2.6;
      const u = (t % T) / T;
      const crouch = easeInOut(seg(u, 0, 0.2)) * (1 - seg(u, 0.2, 0.25));
      const air = u > 0.2 && u < 0.52 ? Math.sin(((u - 0.2) / 0.32) * Math.PI) : 0;
      const land = u >= 0.52 && u < 0.66 ? Math.sin(((u - 0.52) / 0.14) * Math.PI) : 0;
      p.lift = air * 0.14;
      p.sy = 1 - crouch * 0.1 + air * 0.07 - land * 0.1;
      const cheer = u > 0.18 ? 1 : 0.2;
      p.eL = p.eR = lerp(0.8, 1, cheer);
      p.aL = p.aR = 0.1;
      p.hLx = 0.58;
      p.hRx = -0.58;
      p.hLy = p.hRy = lerp(0.3, 0.98, cheer);
      p.hLz = p.hRz = 0.1;
      p.brow = 0.6;
      p.smile = 1;
      p.open = 0.55;
      p.cheeks = 0.8;
      p.lid = 0;
      p.fx = u > 0.2 && u < 0.8 ? 1 : 0;
      break;
    }
    default: {
      // Reposo vivo: respira (fase maestra φ); balanceo, mirada y manos van con la misma fase, y cada tantas
      // respiraciones da un saltito. Es el único estado que sigue al puntero.
      const phi = t * 2.1;
      const br = Math.sin(phi);
      const hasLook = look.x !== 0 || look.y !== 0;
      p.sy = 1 + br * 0.018;
      p.rotZ = Math.sin(phi / 4) * 1.0;
      p.lookX = hasLook ? look.x : Math.sin(phi / 3) * 0.6;
      p.lookY = hasLook ? look.y : Math.sin(phi / 2) * 0.25;
      p.brow = 0.2 + Math.max(0, Math.sin(phi / 3)) * 0.3;
      p.hLy = 0.2 + br * 0.012;
      p.hRy = 0.2 + Math.sin(phi + 0.6) * 0.012;
      const hop = ((phi / (Math.PI * 2)) % 16) / 16;
      if (hop < 0.1) {
        const k = hop / 0.1;
        p.sy -= Math.sin(Math.min(1, k * 2) * Math.PI) * 0.04;
        p.lift = k > 0.4 ? Math.sin(((k - 0.4) / 0.6) * Math.PI) * 0.04 : 0;
      }
      break;
    }
  }

  // "Boing" al tocar: aplastado y rebote que se amortigua enseguida (como mucho 1-2 oscilaciones), boca en "o"
  if (pokeT >= 0 && pokeT < 0.6) {
    p.sy += -0.1 * Math.exp(-9 * pokeT) * Math.cos(18 * pokeT);
    p.lift += Math.max(0, Math.sin(Math.min(pokeT / 0.25, 1) * Math.PI)) * 0.03;
    p.oMouth = Math.max(p.oMouth, 0.6 * Math.exp(-6 * pokeT));
    p.lid = Math.min(p.lid, 0.2);
  }
  return p;
}

/**
 * Mezcla dos poses (`w` 0 = a, 1 = b) para el cambio de actividad (~0,3 s). El curl cambia de modo (−1 = no se
 * usa), así que no se interpola: se pasa de uno a otro en la mitad de la mezcla.
 */
export function blendPose(a: Pose3, b: Pose3, wRaw: number): Pose3 {
  const w = easeInOut(clamp(wRaw, 0, 1));
  const out = { ...b };
  for (const k of Object.keys(b) as (keyof Pose3)[]) out[k] = lerp(a[k], b[k], w);
  out.curl = w < 0.5 ? a.curl : b.curl;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Seguimiento: resortes (rebote) y suavizado exponencial
// ---------------------------------------------------------------------------------------------

/** Magnitudes con resorte de segundo orden (rebotan al llegar). */
const SPRING: Partial<Record<keyof Pose3, { k: number; c: number }>> = {
  lift: { k: 240, c: 24 },
  sy: { k: 260, c: 25 },
  rotZ: { k: 120, c: 17 },
  rotX: { k: 120, c: 17 },
};
/** El resto sigue con suavizado exponencial (más alto = más rápido). */
const K3: Partial<Record<keyof Pose3, number>> = {
  rotY: 10, lookX: 10, lookY: 10, brow: 14, smile: 14, open: 18, oMouth: 18, cheeks: 10,
  eL: 11, eR: 11, aL: 12, aR: 12, hLx: 15, hLy: 15, hLz: 15, hRx: 15, hRy: 15, hRz: 15,
  flex: 16, vDumbbell: 9, vGlass: 9, vBook: 9, glassTilt: 14, water: 12, page: 24, fx: 8,
};
/** Sin suavizado: el parpadeo y el curl (que cambia de modo) se aplican tal cual. */
const DIRECT3 = new Set<keyof Pose3>(["lid", "curl"]);

export interface RigState {
  pose: Pose3;
  vel: Partial<Record<keyof Pose3, number>>;
}

export const createRig = (pose: Pose3 = REST3): RigState => ({ pose: { ...pose }, vel: {} });

/** Avanza el esqueleto hacia la pose objetivo. Inmutable. `dt` se acota a [0.001, 0.05]. */
export function stepRig3(state: RigState, target: Pose3, dtRaw: number): RigState {
  const dt = clamp(dtRaw, 0.001, 0.05);
  const pose = { ...state.pose };
  const vel = { ...state.vel };
  for (const key of Object.keys(target) as (keyof Pose3)[]) {
    if (DIRECT3.has(key)) {
      pose[key] = target[key];
      continue;
    }
    const sp = SPRING[key];
    if (sp) {
      // Subpasos: el resorte es estable con pasos chicos
      const n = Math.ceil(dt / 0.008);
      const h = dt / n;
      let x = pose[key];
      let v = vel[key] ?? 0;
      for (let i = 0; i < n; i++) {
        v += (-sp.k * (x - target[key]) - sp.c * v) * h;
        x += v * h;
      }
      pose[key] = x;
      vel[key] = v;
    } else {
      pose[key] = state.pose[key] + (target[key] - state.pose[key]) * (1 - Math.exp(-(K3[key] ?? 12) * dt));
    }
  }
  return { pose, vel };
}

/** Compensación de volumen: al estirar en Y se adelgaza en X/Z (y al revés), acotada. */
export function volumeScale(sy: number): { sx: number; sy: number; sz: number } {
  const y = clamp(sy, 0.7, 1.25);
  const xz = clamp(1 / Math.sqrt(y), 0.88, 1.2);
  return { sx: xz, sy: y, sz: xz };
}

export interface Limbs3 {
  shoulderL: V3;
  shoulderR: V3;
  elbowL: V3;
  elbowR: V3;
  handL: V3;
  handR: V3;
  /** Escala del nodo del brazo (ARM_SCALE × extensión). */
  scaleL: number;
  scaleR: number;
}

const POLE_L: V3 = [0.55, -0.8, 0.25];
const POLE_R: V3 = [-0.55, -0.8, 0.25];

/** Resuelve ambos brazos con IK 3D (el derecho en modo curl usa un codo fijo). */
export function solveLimbs3(p: Pose3): Limbs3 {
  const eL = clamp(p.eL, 0, 1);
  const eR = clamp(p.eR, 0, 1);
  const shoulderL = shoulderAt(1, p.aL);
  const shoulderR = shoulderAt(-1, p.aR);
  const l1L = L1 * eL;
  const l2L = L2 * eL;
  const l1R = L1 * eR;
  const l2R = L2 * eR;

  const armL = twoBoneIK3(shoulderL, [p.hLx, p.hLy, p.hLz], l1L, l2L, POLE_L);

  let elbowR: V3;
  let handR: V3;
  if (p.curl >= 0) {
    elbowR = curlElbow(shoulderR, l1R);
    handR = add(elbowR, mul(curlDirection(p.curl), l2R));
  } else {
    const r = twoBoneIK3(shoulderR, [p.hRx, p.hRy, p.hRz], l1R, l2R, POLE_R);
    elbowR = r.elbow;
    handR = r.hand;
  }
  return {
    shoulderL, shoulderR, elbowL: armL.elbow, elbowR, handL: armL.hand, handR,
    scaleL: ARM_SCALE * eL, scaleR: ARM_SCALE * eR,
  };
}
