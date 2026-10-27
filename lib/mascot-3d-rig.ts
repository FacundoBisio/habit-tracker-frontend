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
 * - `stepAnimator3`: el bucle completo de un cuadro (actividad, mezcla, toque, resortes, brazos y props). Lo usan
 *   el motor y el simulador de los tests, así lo que se prueba es exactamente lo que se ve.
 *
 * Cada función del bucle tiene su versión "Into"/"InPlace" que escribe en objetos ya creados (el bucle corre a
 * 60 fps y no conviene crear objetos en cada cuadro); las versiones que devuelven objetos nuevos quedan como
 * envoltorios cómodos para los tests.
 *
 * Espacio: el de la raíz del modelo (Y arriba, +Z hacia la cámara). La esfera tiene su origen en la base:
 * centro (0, 0.5, 0), radio 0.5. El brazo L (+x) queda a la derecha de la pantalla; el R (−x), a la izquierda.
 * Los brazos son hijos de la raíz, así que el aplastado (`volumeScale`) los deforma igual que al cuerpo: en este
 * espacio la esfera no cambia de forma.
 */
import type { Activity } from "./mascot";

export type V3 = [number, number, number];

// --- Geometría del modelo (medida del GLB) ---
export const BODY_CENTER: V3 = [0, 0.5, 0];
export const BODY_R = 0.5;
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
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a) || 1e-9;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const dist = (a: V3, b: V3) => len(sub(a, b));
const v3 = (): V3 => [0, 0, 0];
const setV = (o: V3, x: number, y: number, z: number) => {
  o[0] = x;
  o[1] = y;
  o[2] = z;
  return o;
};

/** Franja (fracción del largo total del brazo) donde la IK se suaviza antes de estirarse del todo. */
export const SOFT_IK = 0.08;

/**
 * Dos segmentos de largos `l1` y `l2` desde `shoulder` hasta `target`. El codo se dobla hacia `pole`
 * (el componente del polo perpendicular al eje hombro→mano). Si el objetivo no se alcanza, el brazo
 * queda estirado hacia él. Escribe en `elbow` y `hand`.
 *
 * `bend` (opcional) guarda entre cuadros hacia dónde quedó doblado el codo (unitario, perpendicular al brazo) y
 * `maxTurn` limita cuánto puede girar ese plano por llamada (radianes). Un polo fijo siempre queda casi paralelo
 * al brazo en alguna dirección; ahí el doblez cambia de golpe y, sin límite, el codo se da vuelta en un cuadro.
 */
export function twoBoneIK3Into(
  shoulder: V3, target: V3, l1: number, l2: number, pole: V3, elbow: V3, hand: V3, bend?: V3, maxTurn = Infinity,
) {
  let dx = target[0] - shoulder[0];
  let dy = target[1] - shoulder[1];
  let dz = target[2] - shoulder[2];
  const dl = Math.hypot(dx, dy, dz) || 1e-9;
  dx /= dl;
  dy /= dl;
  dz /= dl;
  // IK suave: cerca del brazo estirado la distancia se acerca al largo total de a poco. Sin esto el codo "salta" a
  // recto en un cuadro (la altura del codo tiene pendiente infinita ahí), por ejemplo al esconder un brazo.
  const total = l1 + l2;
  const sx = shoulder[0], sy = shoulder[1], sz = shoulder[2];
  if (!(total > 1e-9)) {
    // Brazo escondido del todo: todo queda en el hombro
    setV(elbow, sx, sy, sz);
    setV(hand, sx, sy, sz);
    return;
  }
  const soft = SOFT_IK * total;
  let r = dl;
  if (r > total - soft) r = total - soft + soft * (1 - Math.exp(-(r - total + soft) / soft));
  // Márgenes relativos al largo: con márgenes fijos, un brazo casi escondido invertía los límites y el codo volaba
  const reach = clamp(r, Math.abs(l1 - l2) + 1e-4 * total, total * (1 - 1e-4));
  const a = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let pd = pole[0] * dx + pole[1] * dy + pole[2] * dz;
  let px = pole[0] - dx * pd;
  let py = pole[1] - dy * pd;
  let pz = pole[2] - dz * pd;
  if (Math.hypot(px, py, pz) < 1e-6) {
    pd = -dy;
    px = -dx * pd;
    py = -1 - dy * pd;
    pz = -dz * pd;
  }
  let pl = Math.hypot(px, py, pz) || 1e-9;
  px /= pl;
  py /= pl;
  pz /= pl;
  if (bend) {
    // Doblez anterior proyectado al plano perpendicular al brazo actual; se gira hacia el del polo como mucho `maxTurn`
    const bd = bend[0] * dx + bend[1] * dy + bend[2] * dz;
    let bx = bend[0] - dx * bd, by = bend[1] - dy * bd, bz = bend[2] - dz * bd;
    const bl = Math.hypot(bx, by, bz);
    if (bl > 1e-3 && maxTurn < Math.PI) {
      bx /= bl;
      by /= bl;
      bz /= bl;
      // Base del plano: b y q = dir × b; el polo queda a un ángulo phi de b
      const qx = dy * bz - dz * by, qy = dz * bx - dx * bz, qz = dx * by - dy * bx;
      const phi = Math.atan2(px * qx + py * qy + pz * qz, px * bx + py * by + pz * bz);
      const ph = clamp(phi, -maxTurn, maxTurn);
      const c = Math.cos(ph), s = Math.sin(ph);
      px = bx * c + qx * s;
      py = by * c + qy * s;
      pz = bz * c + qz * s;
      pl = Math.hypot(px, py, pz) || 1e-9;
      px /= pl;
      py /= pl;
      pz /= pl;
    }
    setV(bend, px, py, pz);
  }
  setV(elbow, sx + dx * a + px * h, sy + dy * a + py * h, sz + dz * a + pz * h);
  setV(hand, sx + dx * reach, sy + dy * reach, sz + dz * reach);
}

export function twoBoneIK3(shoulder: V3, target: V3, l1: number, l2: number, pole: V3) {
  const elbow = v3();
  const hand = v3();
  twoBoneIK3Into(shoulder, target, l1, l2, pole, elbow, hand);
  return { elbow, hand };
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
  /**
   * Curl del brazo derecho: antebrazo (0 abajo…1 arriba; −1 = no se usa), cuánto pesa el modo curl frente a la IK
   * (0 = IK, 1 = curl; en la mezcla se interpolan las posiciones de los dos modos) y bíceps inflado (0–1).
   */
  curl: number;
  curlW: number;
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
  curl: -1, curlW: 0, flex: 0,
  vDumbbell: 0, vGlass: 0, vBook: 0, glassTilt: 0, water: 1, page: 0, fx: 0,
};

/** Claves de la pose, calculadas una sola vez (el bucle no llama a `Object.keys` en cada cuadro). */
export const POSE_KEYS = Object.keys(REST3) as (keyof Pose3)[];

export function copyPose(out: Pose3, src: Pose3): Pose3 {
  for (const k of POSE_KEYS) out[k] = src[k];
  return out;
}

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
  /** Cuánto manda el puntero (0…1). Si falta, manda del todo cuando hay mirada (x o y distintos de 0). */
  w?: number;
}
const NO_LOOK: Look = { x: 0, y: 0, w: 0 };

/** Posición del hombro dado el azimut (0 = costado, ~1.1 = adelante). `side`: +1 = L (+x), −1 = R (−x). */
export function shoulderAtInto(out: V3, side: 1 | -1, azimuth: number): V3 {
  return setV(out, side * SHOULDER_R * Math.cos(azimuth), 0.48, SHOULDER_R * Math.sin(azimuth) + 0.02);
}
export const shoulderAt = (side: 1 | -1, azimuth: number): V3 => shoulderAtInto(v3(), side, azimuth);

/** Dirección de un antebrazo del curl: 0 = colgando, 1 = doblado hacia el hombro (un poco hacia el frente). */
export function curlDirectionInto(out: V3, curl: number): V3 {
  const phi = clamp(curl, 0, 1) * ((155 * Math.PI) / 180);
  const x = -0.22 * Math.sin(phi), y = -Math.cos(phi), z = 0.5 * Math.sin(phi);
  const l = Math.hypot(x, y, z) || 1e-9;
  return setV(out, x / l, y / l, z / l);
}
export const curlDirection = (curl: number): V3 => curlDirectionInto(v3(), curl);

const CURL_ELBOW_DIR = norm([-0.2, -0.95, 0.28]);
/** Codo fijo del curl (cerca de las costillas, apenas hacia el frente). */
export function curlElbowInto(out: V3, shoulder: V3, elbowLen: number): V3 {
  return setV(
    out,
    shoulder[0] + CURL_ELBOW_DIR[0] * elbowLen,
    shoulder[1] + CURL_ELBOW_DIR[1] * elbowLen,
    shoulder[2] + CURL_ELBOW_DIR[2] * elbowLen,
  );
}
export const curlElbow = (shoulder: V3, elbowLen: number): V3 => curlElbowInto(v3(), shoulder, elbowLen);

const rad = (deg: number) => (deg * Math.PI) / 180;
export { rad };

/**
 * Pose objetivo de una actividad en el instante `t` (s), escrita en `p`. `pokeT` = segundos desde el último toque
 * (−1 = ninguno).
 *
 * Regla de diseño: cada actividad tiene UN movimiento principal con una fase maestra (`u` del ciclo o `psi`);
 * todo lo secundario (respiración, balanceo, mirada, cola de los brazos) se deriva de esa misma fase y con poca
 * amplitud, nunca de relojes independientes. Solo el reposo usa el puntero (`look`) y sus detalles propios.
 */
export function computePose3Into(p: Pose3, activity: Activity, t: number, look: Look = NO_LOOK, pokeT = -1): Pose3 {
  copyPose(p, REST3);
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
      // Mano arriba pero al alcance del brazo (si no, el brazo queda tieso y la mano no sigue el saludo)
      p.hLx = 0.65 + 0.065 * s;
      p.hLy = 0.86 + 0.02 * Math.cos(psi);
      p.hLz = 0.14;
      p.eR = 0.6;
      p.hRy = 0.25;
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
      // El brazo izquierdo se esconde hacia el costado (no hacia abajo): si apunta para abajo, mientras se acorta
      // queda rozando el cuerpo y se ve plegado (pasaba al venir de leer)
      p.hLx = 0.72;
      p.hLy = 0.36;
      p.hLz = 0.06;
      p.aR = 0.28;
      p.curl = up + (u > 0.45 && u < 0.58 ? Math.sin(u * Math.PI * 2 * 20) * 0.012 : 0);
      p.curlW = 1;
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
      // 0→180: la hoja pasa de la mitad derecha al dorso del libro. Al reiniciar el ciclo vuelve a 0 de golpe
      // (detrás del libro no se ve); `stepRig3` se encarga de que nunca se la vea girar para atrás.
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
      // Brazos caídos casi estirados, en la misma dirección de siempre pero al alcance (antes quedaban tiesos)
      p.hLx = 0.49;
      p.hRx = -0.49;
      p.hLy = p.hRy = 0.225;
      p.hLz = p.hRz = 0.165;
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
      // Los brazos suben durante el agachado (llegan arriba al despegar) y bajan al final del ciclo: antes el
      // objetivo saltaba de golpe y las manos pegaban un tirón (al subir y al reiniciar el ciclo).
      const cheer = 0.2 + 0.8 * (easeInOut(seg(u, 0.02, 0.24)) - easeInOut(seg(u, 0.78, 1)));
      p.eL = p.eR = lerp(0.8, 1, cheer);
      p.aL = p.aR = 0.1;
      p.hLx = 0.58;
      p.hRx = -0.58;
      p.hLy = p.hRy = lerp(0.3, 0.95, cheer);
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
      // respiraciones da un saltito. Es el único estado que sigue al puntero (con el peso `look.w`, que se
      // apaga solo un rato después de soltar el puntero: así la mirada vuelve sin saltos a su vaivén).
      const phi = t * 2.1;
      const br = Math.sin(phi);
      const lw = clamp(look.w ?? (look.x !== 0 || look.y !== 0 ? 1 : 0), 0, 1);
      p.sy = 1 + br * 0.018;
      p.rotZ = Math.sin(phi / 4) * 1.0;
      p.lookX = lerp(Math.sin(phi / 3) * 0.6, look.x, lw);
      p.lookY = lerp(Math.sin(phi / 2) * 0.25, look.y, lw);
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

  return applyPoke3(p, pokeT);
}

export const computePose3 = (activity: Activity, t: number, look: Look = NO_LOOK, pokeT = -1): Pose3 =>
  computePose3Into({ ...REST3 }, activity, t, look, pokeT);

/** "Boing" al tocar: aplastado y rebote que se amortigua enseguida (como mucho 1-2 oscilaciones), boca en "o". */
export function applyPoke3(p: Pose3, pokeT: number): Pose3 {
  if (pokeT >= 0 && pokeT < 0.6) {
    p.sy += -0.1 * Math.exp(-9 * pokeT) * Math.cos(18 * pokeT);
    p.lift += Math.max(0, Math.sin(Math.min(pokeT / 0.25, 1) * Math.PI)) * 0.03;
    p.oMouth = Math.max(p.oMouth, 0.6 * Math.exp(-6 * pokeT));
    p.lid = Math.min(p.lid, 0.2);
  }
  return p;
}

/**
 * Mezcla dos poses (`w` 0 = a, 1 = b) para el cambio de actividad (ver `BLEND3`), escrita en `out` (puede ser `a`
 * o `b`).
 * - El curl no cambia de modo de golpe: se mezcla su peso `curlW` y `solveLimbs3` interpola objetivo y polo de los
 *   dos modos (la fase del curl es la de la pose que lo usa).
 * - La página no se interpola (iría para atrás): manda la pose que tiene el libro; si ninguna, se queda donde estaba.
 * - Las manos giran alrededor del hombro (dirección por interpolación esférica y distancia lineal): en línea recta,
 *   al bajar una mano que estaba arriba pasaba pegada al hombro, el brazo se plegaba y el codo pegaba un latigazo.
 */
export function blendPoseInto(out: Pose3, a: Pose3, b: Pose3, wRaw: number): Pose3 {
  const w = easeInOut(clamp(wRaw, 0, 1));
  const aCurl = a.curl, bCurl = b.curl;
  const page = b.vBook > 0 ? b.page : a.page;
  const arc = w > 0 && w < 1;
  if (arc) {
    // Se calcula antes del bucle porque `out` puede ser `a` o `b`
    blendHandInto(handL, 1, a.aL, a.hLx, a.hLy, a.hLz, b.aL, b.hLx, b.hLy, b.hLz, w);
    blendHandInto(handR, -1, a.aR, a.hRx, a.hRy, a.hRz, b.aR, b.hRx, b.hRy, b.hRz, w);
  }
  for (const k of POSE_KEYS) out[k] = lerp(a[k], b[k], w);
  out.curl = out.curlW <= 0 ? -1 : aCurl < 0 ? bCurl : bCurl < 0 ? aCurl : lerp(aCurl, bCurl, w);
  out.page = page;
  if (arc) {
    out.hLx = handL[0];
    out.hLy = handL[1];
    out.hLz = handL[2];
    out.hRx = handR[0];
    out.hRy = handR[1];
    out.hRz = handR[2];
  }
  return out;
}

const handL = v3();
const handR = v3();
const shA = v3();
const shB = v3();
const shW = v3();

/** Mano mezclada alrededor del hombro mezclado (ver `blendPoseInto`). */
function blendHandInto(
  out: V3, side: 1 | -1, azA: number, ax: number, ay: number, az: number, azB: number, bx: number, by: number, bz: number, w: number,
) {
  shoulderAtInto(shA, side, azA);
  shoulderAtInto(shB, side, azB);
  shoulderAtInto(shW, side, lerp(azA, azB, w));
  let ux = ax - shA[0], uy = ay - shA[1], uz = az - shA[2];
  let vx = bx - shB[0], vy = by - shB[1], vz = bz - shB[2];
  const ra = Math.hypot(ux, uy, uz), rb = Math.hypot(vx, vy, vz);
  if (ra < 1e-6 || rb < 1e-6) return setV(out, lerp(ax, bx, w), lerp(ay, by, w), lerp(az, bz, w));
  ux /= ra;
  uy /= ra;
  uz /= ra;
  vx /= rb;
  vy /= rb;
  vz /= rb;
  const c = clamp(ux * vx + uy * vy + uz * vz, -1, 1);
  const r = lerp(ra, rb, w);
  let dx: number, dy: number, dz: number;
  if (c > 0.9995 || c < -0.98) {
    // Casi iguales (da lo mismo) u opuestas (no hay un arco preferido): lineal
    dx = lerp(ux, vx, w);
    dy = lerp(uy, vy, w);
    dz = lerp(uz, vz, w);
    const l = Math.hypot(dx, dy, dz) || 1e-9;
    dx /= l;
    dy /= l;
    dz /= l;
  } else {
    const th = Math.acos(c);
    const s = Math.sin(th);
    const wa = Math.sin((1 - w) * th) / s;
    const wb = Math.sin(w * th) / s;
    dx = ux * wa + vx * wb;
    dy = uy * wa + vy * wb;
    dz = uz * wa + vz * wb;
  }
  return setV(out, shW[0] + dx * r, shW[1] + dy * r, shW[2] + dz * r);
}

export const blendPose = (a: Pose3, b: Pose3, wRaw: number): Pose3 => blendPoseInto({ ...REST3 }, a, b, wRaw);

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
  eL: 11, eR: 11, aL: 12, aR: 12, hLx: 15, hLy: 15, hLz: 15, hRx: 15, hRy: 15, hRz: 15, curlW: 11,
  flex: 16, vDumbbell: 9, vGlass: 9, vBook: 9, glassTilt: 14, water: 12, page: 24, fx: 8,
};
/**
 * Sin suavizado: el parpadeo y la fase del curl (ya llega suave de la animación). El peso del curl sí se suaviza
 * como el resto del brazo; mientras no llega a 0 se conserva la última fase (ver `stepRig3InPlace`).
 */
const DIRECT3 = new Set<keyof Pose3>(["lid", "curl"]);

/** A partir de este ángulo la hoja está detrás del libro (no se ve): recién ahí puede volver a 0. */
export const PAGE_HIDDEN = 179;
/** La hoja se ve si el libro se ve y no está detrás de él. */
export const pageVisible = (p: Pose3) => p.vBook > 0.03 && p.page < PAGE_HIDDEN;

type Track = { key: keyof Pose3; mode: "direct" | "spring" | "exp" | "page"; k: number; c: number };
/** Plan de seguimiento precalculado (una entrada por clave, sin búsquedas en cada cuadro). */
const TRACKS: Track[] = POSE_KEYS.map((key) => {
  const sp = SPRING[key];
  if (DIRECT3.has(key)) return { key, mode: "direct", k: 0, c: 0 };
  if (sp) return { key, mode: "spring", k: sp.k, c: sp.c };
  return { key, mode: key === "page" ? "page" : "exp", k: K3[key] ?? 12, c: 0 };
});

export interface RigState {
  pose: Pose3;
  vel: Partial<Record<keyof Pose3, number>>;
}

export const createRig = (pose: Pose3 = REST3): RigState => ({ pose: { ...pose }, vel: {} });

/** Avanza el esqueleto hacia la pose objetivo, modificando `state`. `dt` se acota a [0.001, 0.05]. */
export function stepRig3InPlace(state: RigState, target: Pose3, dtRaw: number): RigState {
  const dt = clamp(dtRaw, 0.001, 0.05);
  const pose = state.pose;
  const vel = state.vel;
  const bookShown = pose.vBook > 0.03;
  const prevCurl = pose.curl;
  for (const tr of TRACKS) {
    const key = tr.key;
    if (tr.mode === "direct") {
      pose[key] = target[key];
    } else if (tr.mode === "spring") {
      // Subpasos: el resorte es estable con pasos chicos
      const n = Math.ceil(dt / 0.008);
      const h = dt / n;
      let x = pose[key];
      let v = vel[key] ?? 0;
      for (let i = 0; i < n; i++) {
        v += (-tr.k * (x - target[key]) - tr.c * v) * h;
        x += v * h;
      }
      pose[key] = x;
      vel[key] = v;
    } else if (tr.mode === "page") {
      // La hoja solo gira hacia adelante: si el objetivo queda atrás y la hoja se ve, termina de dar vuelta
      // (hasta quedar detrás del libro) y recién ahí salta al objetivo.
      const cur = pose.page;
      const tgt = target.page;
      const a = 1 - Math.exp(-tr.k * dt);
      if (tgt >= cur) pose.page = cur + (tgt - cur) * a;
      else if (cur >= PAGE_HIDDEN || !bookShown) pose.page = tgt;
      else pose.page = cur + (180 - cur) * a;
    } else {
      pose[key] = pose[key] + (target[key] - pose[key]) * (1 - Math.exp(-tr.k * dt));
    }
  }
  // Fase del curl: si el objetivo ya no lo usa pero el peso todavía no se apagó, se queda la última fase
  if (target.curl < 0) {
    if (pose.curlW > 1e-3) pose.curl = Math.max(0, prevCurl);
    else {
      pose.curlW = 0;
      pose.curl = -1;
    }
  }
  return state;
}

/** Igual que `stepRig3InPlace` pero inmutable (devuelve un estado nuevo). */
export function stepRig3(state: RigState, target: Pose3, dtRaw: number): RigState {
  return stepRig3InPlace({ pose: { ...state.pose }, vel: { ...state.vel } }, target, dtRaw);
}

/** Compensación de volumen: al estirar en Y se adelgaza en X/Z (y al revés), acotada. Escribe en `out`. */
export function volumeScaleInto(out: { sx: number; sy: number; sz: number }, sy: number) {
  const y = clamp(sy, 0.7, 1.25);
  const xz = clamp(1 / Math.sqrt(y), 0.88, 1.2);
  out.sx = xz;
  out.sy = y;
  out.sz = xz;
  return out;
}
export const volumeScale = (sy: number) => volumeScaleInto({ sx: 1, sy: 1, sz: 1 }, sy);

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
  /** Hacia dónde quedó doblado cada codo (lo usa el cuadro siguiente para no darlo vuelta de golpe). */
  bendL: V3;
  bendR: V3;
}

export const createLimbs3 = (): Limbs3 => ({
  shoulderL: v3(), shoulderR: v3(), elbowL: v3(), elbowR: v3(), handL: v3(), handR: v3(), scaleL: 0, scaleR: 0,
  bendL: v3(), bendR: v3(),
});

const POLE_L: V3 = [0.55, -0.8, 0.25];
const POLE_R: V3 = [-0.55, -0.8, 0.25];
/**
 * Giro máximo del plano del codo (rad/s). El polo fijo queda casi paralelo al brazo caído del reposo: al empezar a
 * saludar, bailar o correr el doblez ideal giraba hasta 180° en un par de cuadros y el codo saltaba. Con este límite
 * el codo gira como mucho ~0,026 unidades por cuadro a 60 fps (L1 × 6 / 60); en las poses normales no se nota.
 */
export const ELBOW_TURN = 6;
// Auxiliares de `solveLimbs3Into` (se reutilizan en cada cuadro)
const tgtS = v3();
const poleS = v3();
const cuE = v3();
const cuD = v3();

/**
 * Resuelve ambos brazos con IK 3D, escribiendo en `out`.
 *
 * El derecho en modo curl (codo fijo junto a las costillas y antebrazo que gira) también se resuelve con la IK: el
 * objetivo es la mano del curl y el polo apunta al codo del curl, así sale exactamente ese codo. Con un peso intermedio
 * (en la mezcla) se interpolan objetivo y polo entre los dos modos: la mano no se teletransporta y los largos del
 * brazo se mantienen.
 *
 * Con `dt` > 0 (el bucle) el plano de cada codo sigue al del cuadro anterior y gira como mucho `ELBOW_TURN`·dt;
 * sin `dt` (llamada suelta) se usa el polo tal cual. En curl puro no se limita (el codo tiene que quedar fijo).
 */
export function solveLimbs3Into(p: Pose3, out: Limbs3, dt = 0): Limbs3 {
  const eL = clamp(p.eL, 0, 1);
  const eR = clamp(p.eR, 0, 1);
  const sL = shoulderAtInto(out.shoulderL, 1, p.aL);
  const sR = shoulderAtInto(out.shoulderR, -1, p.aR);
  const l1R = L1 * eR;
  const l2R = L2 * eR;
  const turn = dt > 0 ? ELBOW_TURN * dt : Infinity;

  setV(tgtS, p.hLx, p.hLy, p.hLz);
  twoBoneIK3Into(sL, tgtS, L1 * eL, L2 * eL, POLE_L, out.elbowL, out.handL, out.bendL, turn);

  const cw = p.curl < 0 ? 0 : clamp(p.curlW, 0, 1);
  if (cw <= 0) {
    setV(tgtS, p.hRx, p.hRy, p.hRz);
    twoBoneIK3Into(sR, tgtS, l1R, l2R, POLE_R, out.elbowR, out.handR, out.bendR, turn);
  } else {
    curlElbowInto(cuE, sR, l1R);
    curlDirectionInto(cuD, p.curl);
    setV(
      tgtS,
      lerp(p.hRx, cuE[0] + cuD[0] * l2R, cw),
      lerp(p.hRy, cuE[1] + cuD[1] * l2R, cw),
      lerp(p.hRz, cuE[2] + cuD[2] * l2R, cw),
    );
    setV(
      poleS,
      lerp(POLE_R[0], CURL_ELBOW_DIR[0], cw),
      lerp(POLE_R[1], CURL_ELBOW_DIR[1], cw),
      lerp(POLE_R[2], CURL_ELBOW_DIR[2], cw),
    );
    twoBoneIK3Into(sR, tgtS, l1R, l2R, poleS, out.elbowR, out.handR, out.bendR, cw >= 1 ? Infinity : turn);
  }
  out.scaleL = ARM_SCALE * eL;
  out.scaleR = ARM_SCALE * eR;
  return out;
}

export const solveLimbs3 = (p: Pose3): Limbs3 => solveLimbs3Into(p, createLimbs3());

// ---------------------------------------------------------------------------------------------
// Props y cara (posiciones que el motor aplica tal cual)
// ---------------------------------------------------------------------------------------------

export interface Props3 {
  dumbbell: V3;
  glass: V3;
  book: V3;
}
export const createProps3 = (): Props3 => ({ dumbbell: v3(), glass: v3(), book: v3() });

/** Dónde van los props: mancuerna y vaso en la mano derecha, el libro entre las dos manos. */
export function propsInto(p: Pose3, L: Limbs3, out: Props3): Props3 {
  const hR = L.handR;
  const hL = L.handL;
  setV(out.dumbbell, hR[0], hR[1] + 0.01, hR[2] + 0.02);
  setV(out.glass, hR[0], hR[1] + 0.07 * (1 - clamp(p.glassTilt, 0, 120) / 120), hR[2] + 0.02);
  setV(out.book, (hL[0] + hR[0]) / 2, (hL[1] + hR[1]) / 2 - 0.07, (hL[2] + hR[2]) / 2 + 0.05);
  return out;
}

/** Corrimiento de las pupilas (unidades del modelo). La mirada se acota a [−1, 1] para no salirse del ojo. */
export const PUPIL_RANGE = { x: 0.032, y: 0.026 } as const;
export function pupilOffset3(p: Pose3, out: { x: number; y: number }) {
  out.x = clamp(p.lookX, -1, 1) * PUPIL_RANGE.x || 0;
  out.y = -clamp(p.lookY, -1, 1) * PUPIL_RANGE.y || 0;
  return out;
}

// ---------------------------------------------------------------------------------------------
// Mirada al puntero: se apaga sola un rato después del último movimiento
// ---------------------------------------------------------------------------------------------

/** Segundos sin puntero hasta que la mirada empieza a soltarse, y cuánto tarda en volver. */
export const LOOK_HOLD_S = 1.5;
export const LOOK_FADE_S = 0.4;

/** Peso de la mirada al puntero según los segundos desde el último movimiento (1 = lo sigue, 0 = suelta). */
export function lookWeight(idleS: number): number {
  if (!(idleS >= 0)) return idleS < 0 ? 1 : 0;
  return 1 - easeInOut(seg(idleS, LOOK_HOLD_S, LOOK_HOLD_S + LOOK_FADE_S));
}

export interface LookState extends Look {
  w: number;
  /** Momento (s) del último movimiento del puntero; −Infinity = nunca. */
  at: number;
}
export const createLook3 = (): LookState => ({ x: 0, y: 0, w: 0, at: -Infinity });

/** El puntero se movió: la mirada va a (x, y), acotada a [−1, 1]. */
export function pointLook3(s: LookState, x: number, y: number, nowS: number) {
  s.x = clamp(x, -1, 1) || 0;
  s.y = clamp(y, -1, 1) || 0;
  s.at = nowS;
  s.w = 1;
}

/** Se levantó el dedo: la mirada empieza a soltarse ya (en táctil no hay "puntero quieto encima"). */
export function releaseLook3(s: LookState, nowS: number) {
  if (s.at > -Infinity) s.at = Math.min(s.at, nowS - LOOK_HOLD_S);
}

/** Actualiza el peso de la mirada; cuando se apaga del todo vuelve a (0, 0). */
export function updateLook3(s: LookState, nowS: number): LookState {
  s.w = s.at === -Infinity ? 0 : lookWeight(nowS - s.at);
  if (s.w <= 0) {
    s.w = 0;
    s.x = 0;
    s.y = 0;
  }
  return s;
}

// ---------------------------------------------------------------------------------------------
// Salida natural de una actividad (para no cortar un gesto a la mitad)
// ---------------------------------------------------------------------------------------------

/** Período del movimiento principal de cada actividad (s). */
export const ACTIVITY_PERIOD: Record<Activity, number> = {
  idle: (2 * Math.PI) / 2.1,
  wave: 1 / 1.8,
  lift: 3.4,
  drink: 4.4,
  read: 3.4,
  meditate: (2 * Math.PI) / 1.15,
  run: 0.5,
  sleep: (2 * Math.PI) / 0.95,
  dance: 1 / 1.6,
  celebrate: 2.6,
};

/**
 * Tramos del ciclo (fase 0…1) donde cortar la actividad queda natural. Las que no figuran son continuas (se pueden
 * dejar en cualquier momento: la mezcla corta ya queda bien).
 * - lift: con la mancuerna abajo, después de bajarla.
 * - drink: con el vaso abajo, después de tomar.
 * - celebrate: ya aterrizado.
 * - read: fuera de la vuelta de página.
 */
const EXIT_WINDOWS: Partial<Record<Activity, [number, number][]>> = {
  lift: [[0.9, 1]],
  drink: [[0.87, 1]],
  celebrate: [[0.72, 1]],
  read: [[0, 0.74], [0.93, 1]],
};
/** Se apunta un poquito adentro del tramo (los temporizadores no son exactos al cuadro). */
const EXIT_MARGIN_S = 0.05;

/** Fase (0…1) del movimiento principal de `activity` a los `t` segundos de empezada. */
export function exitPhase(activity: Activity, t: number): number {
  const T = ACTIVITY_PERIOD[activity];
  if (!(t >= 0)) return 0;
  return (t % T) / T;
}

/** ¿Cortar `activity` en el instante `t` queda natural? */
export function isNaturalExit(activity: Activity, t: number): boolean {
  const windows = EXIT_WINDOWS[activity];
  if (!windows) return true;
  const u = exitPhase(activity, t);
  return windows.some(([a, b]) => u >= a && u < b);
}

/** Segundos hasta el próximo punto de salida natural (0 si ya está en uno). Nunca más de un ciclo. */
export function naturalExitDelay(activity: Activity, t: number): number {
  const windows = EXIT_WINDOWS[activity];
  if (!windows || isNaturalExit(activity, t)) return 0;
  const T = ACTIVITY_PERIOD[activity];
  const u = exitPhase(activity, t);
  let best = T;
  for (const [a] of windows) best = Math.min(best, (((a - u) % 1) + 1) % 1 * T + EXIT_MARGIN_S);
  return Math.min(best, T);
}

// ---------------------------------------------------------------------------------------------
// Bucle de un cuadro (lo comparten el motor y el simulador)
// ---------------------------------------------------------------------------------------------

/**
 * Duración de la mezcla entre actividades (s): corta, para que las dos poses no se pisen. Si las manos o los codos
 * tienen que viajar mucho (de las manos arriba al libro, por ejemplo) se estira hasta `BLEND3_MAX`, para que ningún
 * punto del brazo vaya más rápido que ~`BLEND3_SPEED` (unidades/s): con 0,3 s fijos esos cambios pegaban un tirón.
 */
export const BLEND3 = 0.3;
export const BLEND3_MAX = 0.9;
export const BLEND3_SPEED = 1.25;

export interface Animator3 {
  t: number;
  act: Activity;
  actStart: number;
  blendStart: number;
  blendDur: number;
  pokeAt: number;
  rig: RigState;
  /** Origen congelado de la mezcla: la pose que se estaba persiguiendo cuando cambió la actividad. */
  from: Pose3;
  /** Objetivo del último cuadro antes del toque (de ahí sale `from`). */
  last: Pose3;
  base: Pose3;
  target: Pose3;
  limbs: Limbs3;
  props: Props3;
}

export function createAnimator3(act: Activity = "idle", pose: Pose3 = REST3): Animator3 {
  const an: Animator3 = {
    t: 0, act, actStart: 0, blendStart: -1, blendDur: BLEND3, pokeAt: -1,
    rig: createRig(pose), from: { ...pose }, last: { ...pose }, base: { ...pose }, target: { ...pose },
    limbs: createLimbs3(), props: createProps3(),
  };
  return syncAnimator3(an);
}

const travelLimbs = createLimbs3();
const travelPose: Pose3 = { ...REST3 };
const travelMix: Pose3 = { ...REST3 };
const travelPrev = { hL: v3(), hR: v3() };
const eL0 = v3();
const eR0 = v3();
const TRAVEL_STEPS = 8;
const CURL_TRAVEL = 1.5;

/**
 * Cuánto recorre el punto del brazo que más se mueve en la mezcla de `a` a `b`: el camino de las manos (muestreado,
 * porque giran alrededor del hombro y el brazo puede esconderse mientras gira) y la distancia directa de los codos.
 */
function blendTravel(a: Pose3, b: Pose3): number {
  let pathL = 0;
  let pathR = 0;
  let L = solveLimbs3Into(a, travelLimbs);
  setV(eL0, L.elbowL[0], L.elbowL[1], L.elbowL[2]);
  setV(eR0, L.elbowR[0], L.elbowR[1], L.elbowR[2]);
  setV(travelPrev.hL, L.handL[0], L.handL[1], L.handL[2]);
  setV(travelPrev.hR, L.handR[0], L.handR[1], L.handR[2]);
  for (let i = 1; i <= TRAVEL_STEPS; i++) {
    L = solveLimbs3Into(blendPoseInto(travelMix, a, b, i / TRAVEL_STEPS), travelLimbs);
    pathL += dist(L.handL, travelPrev.hL);
    pathR += dist(L.handR, travelPrev.hR);
    setV(travelPrev.hL, L.handL[0], L.handL[1], L.handL[2]);
    setV(travelPrev.hR, L.handR[0], L.handR[1], L.handR[2]);
  }
  // La fase del curl no pasa por el suavizado del esqueleto: lo que recorre la mano derecha en curl cuenta más
  if (a.curlW > 0 || b.curlW > 0) pathR *= CURL_TRAVEL;
  return Math.max(pathL, pathR, dist(eL0, L.elbowL), dist(eR0, L.elbowR));
}

/** Recalcula brazos y props desde la pose actual del esqueleto (`dt` > 0 limita el giro de los codos). */
export function syncAnimator3(an: Animator3, dt = 0): Animator3 {
  solveLimbs3Into(an.rig.pose, an.limbs, dt);
  propsInto(an.rig.pose, an.limbs, an.props);
  return an;
}

/**
 * Un cuadro: si cambió la actividad, la mezcla arranca desde la pose que se estaba persiguiendo (congelada, así
 * cortar una mezcla a la mitad no pega un salto); después objetivo → mezcla → toque → resortes → brazos → props.
 */
export function stepAnimator3(an: Animator3, dtRaw: number, wanted: Activity, look: Look = NO_LOOK, poke = false) {
  const dt = clamp(dtRaw, 0.001, 0.05);
  an.t += dt;
  const t = an.t;
  if (wanted !== an.act) {
    copyPose(an.from, an.last);
    an.act = wanted;
    an.actStart = t; // cada actividad arranca su ciclo desde el principio (anticipación incluida)
    an.blendStart = t;
    computePose3Into(travelPose, wanted, wanted === "idle" ? t : 0, look, -1);
    an.blendDur = clamp(blendTravel(an.from, travelPose) / BLEND3_SPEED, BLEND3, BLEND3_MAX);
  }
  if (poke) an.pokeAt = t;

  computePose3Into(an.base, an.act, an.act === "idle" ? t : t - an.actStart, look, -1);
  const w = an.blendStart >= 0 ? (t - an.blendStart) / an.blendDur : 1;
  if (w < 1) blendPoseInto(an.target, an.from, an.base, w);
  else copyPose(an.target, an.base);
  copyPose(an.last, an.target);
  applyPoke3(an.target, an.pokeAt >= 0 ? t - an.pokeAt : -1);

  stepRig3InPlace(an.rig, an.target, dt);
  return syncAnimator3(an, dt);
}
