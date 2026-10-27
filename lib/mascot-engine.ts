"use client";

import {
  DirectionalLight, HemisphereLight, MathUtils, NeutralToneMapping, PerspectiveCamera, Quaternion, Scene, Vector3,
  WebGLRenderer, type Mesh, type MeshStandardMaterial, type Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Activity } from "@/lib/mascot";
import { MODEL_URL, REQUIRED_NODES, setMascotMode } from "@/lib/mascot-3d";
import { mascotStats, setMascotStatus } from "@/lib/mascot-engine-state";
import { SEG1, SEG2, blendPose, computePose3, createRig, solveLimbs3, stepRig3, volumeScale, type Pose3, type V3 } from "@/lib/mascot-3d-rig";
import { toast } from "@/lib/notify";

/**
 * Motor único del personaje 3D. Hay UN renderer, UN canvas, UN modelo parseado y UN bucle de animación para
 * toda la pestaña: los componentes solo "enganchan" el canvas en su caja (`attachMascot`) y lo sueltan al
 * desmontarse. Así pasar de pantalla (intro → nombre → app) no recrea el contexto WebGL ni vuelve a bajar el
 * modelo, y el personaje sigue en la pose donde estaba.
 */

/** El lienzo es más grande que la caja del personaje para no recortar saltos ni brazos en alto. */
const OVERSCAN = 1.3;
/** Tamaño de los props respecto del modelo original (se leen mejor a ~140 px de ancho). */
const PROP_SCALE = { dumbbell: 2.0, glass: 2.3, book: 2.0 } as const;
const BLEND = 0.3; // mezcla corta entre actividades: las dos poses no se pisan
const SLOW_WORK_MS = 25; // si dibujar un cuadro cuesta más que esto de promedio, el equipo no da
const SLOW_WINDOW_S = 2;
const rad = MathUtils.degToRad;

export interface MascotHandle {
  setActivity(a: Activity): void;
  /** Un "boing" corto (al tocar al personaje). */
  poke(): void;
  detach(): void;
}
export interface AttachOptions {
  activity: Activity;
  interactive: boolean;
  /** Se llama cuando el primer cuadro ya está dibujado en esa caja (recién ahí conviene mostrarla). */
  onFirstFrame?: () => void;
}

interface Attachment {
  box: HTMLElement;
  interactive: boolean;
  onFirstFrame?: () => void;
  announced: boolean;
  visible: boolean;
  io: IntersectionObserver;
  ro: ResizeObserver;
}

type Arm = { arm: Object3D; fore: Object3D; hand: Object3D; side: 1 | -1 };

// --- Estado del módulo (un solo juego de recursos) ---
let renderer: WebGLRenderer | null = null;
let canvas: HTMLCanvasElement | null = null;
const scene = new Scene();
const camera = new PerspectiveCamera(28, 1, 0.1, 50);
let loadPromise: Promise<void> | null = null;
let ready = false;

let outer: Object3D | null = null;
let root: Object3D | null = null;
let armL: Arm | null = null;
let armR: Arm | null = null;
let bicep: Object3D | null = null;
let pupilL: Object3D | null = null;
let pupilR: Object3D | null = null;
const pupilRest = { lx: 0, ly: 0, rx: 0, ry: 0 };
const props = {} as Record<"dumbbell" | "glass" | "water" | "book" | "page" | "fx", Object3D>;
const morphs = new Map<string, { mesh: Mesh; index: number }[]>();

const stack: Attachment[] = []; // el último enganchado es el que se ve
let raf = 0;
let throttle30 = false; // calidad adaptativa: 30 fps en equipos justos
let skip = false;
let workAvg = 0;
let workSince = 0;
let slowStrikes = 0;

// Animación (vive en el motor, no en el componente: al mover el canvas no hay saltos)
let rig = createRig();
let t = 0;
let actStart = 0;
let currentAct: Activity = "idle";
let prevAct: Activity = "idle";
let prevStart = 0;
let blendStart = -1;
let pokeAt = -1;
let wantedAct: Activity = "idle";
let wantPoke = false;
let lastFrame = 0;
const look = { x: 0, y: 0 };

const setMorph = (name: string, value: number) => {
  const list = morphs.get(name);
  if (!list) return;
  const v = MathUtils.clamp(value, 0, 1);
  for (const { mesh, index } of list) mesh.morphTargetInfluences![index] = v;
};

// Auxiliares reutilizables (no se crean objetos nuevos en cada cuadro)
const axisL = new Vector3(1, 0, 0);
const axisR = new Vector3(-1, 0, 0);
const d1 = new Vector3();
const d2 = new Vector3();
const q1 = new Quaternion();
const qInv = new Quaternion();
const hv = new Vector3();
const hv2 = new Vector3();
const set3 = (v: Vector3, p: V3) => v.set(p[0], p[1], p[2]);

/** Orienta el brazo: el nodo del brazo apunta al codo y el antebrazo, del codo a la mano. */
function poseArm(a: Arm, S: V3, E: V3, H: V3, scale: number) {
  a.arm.visible = scale > 0.06;
  if (!a.arm.visible) return;
  const axis = a.side === 1 ? axisL : axisR;
  a.arm.position.set(S[0], S[1], S[2]);
  a.arm.scale.setScalar(scale);
  d1.set(E[0] - S[0], E[1] - S[1], E[2] - S[2]).normalize();
  q1.setFromUnitVectors(axis, d1);
  a.arm.quaternion.copy(q1);
  d2.set(H[0] - E[0], H[1] - E[1], H[2] - E[2]).normalize().applyQuaternion(qInv.copy(q1).invert());
  a.fore.quaternion.setFromUnitVectors(axis, d2);
  a.hand.quaternion.identity();
}

const tilt = { x: 0, y: 0 };
export function setTilt(x: number, y: number) {
  tilt.x = x;
  tilt.y = y;
}

function apply(p: Pose3, tiltGain: number) {
  if (!root || !outer) return;

  // Cuerpo: aplastado/estirado con el volumen compensado, rebote e inclinaciones
  const vs = volumeScale(p.sy);
  root.position.y = p.lift;
  root.scale.set(vs.sx, vs.sy, vs.sz);
  root.rotation.set(rad(p.rotX), rad(p.rotY), rad(p.rotZ));

  // Cara
  setMorph("blink_L", p.lid);
  setMorph("blink_R", p.lid);
  setMorph("browAngry", Math.max(0, -p.brow));
  setMorph("browRaise", Math.max(0, p.brow));
  setMorph("smile", p.smile);
  setMorph("mouthOpen", p.open);
  setMorph("mouthO", p.oMouth);
  setMorph("cheeksPuff", p.cheeks);
  setMorph("bicepFlex", p.flex);
  if (pupilL && pupilR) {
    pupilL.position.x = pupilRest.lx + p.lookX * 0.032;
    pupilL.position.y = pupilRest.ly - p.lookY * 0.026;
    pupilR.position.x = pupilRest.rx + p.lookX * 0.032;
    pupilR.position.y = pupilRest.ry - p.lookY * 0.026;
  }

  // Brazos (IK)
  const L = solveLimbs3(p);
  if (armL) poseArm(armL, L.shoulderL, L.elbowL, L.handL, L.scaleL);
  if (armR) poseArm(armR, L.shoulderR, L.elbowR, L.handR, L.scaleR);
  if (bicep) {
    bicep.visible = p.flex > 0.03;
    bicep.scale.setScalar(0.6 + 0.5 * p.flex);
  }

  // Props en las manos
  const show = (o: Object3D, v: number, base: number) => {
    o.visible = v > 0.03;
    o.scale.setScalar(base * v);
  };
  show(props.dumbbell, p.vDumbbell, PROP_SCALE.dumbbell);
  if (props.dumbbell.visible) {
    set3(hv, L.handR);
    props.dumbbell.position.set(hv.x, hv.y + 0.01, hv.z + 0.02);
    props.dumbbell.rotation.set(0, Math.PI / 2, rad(-8 * p.curl));
  }
  show(props.glass, p.vGlass, PROP_SCALE.glass);
  if (props.glass.visible) {
    set3(hv, L.handR);
    props.glass.position.set(hv.x, hv.y + 0.07 * (1 - p.glassTilt / 120), hv.z + 0.02);
    props.glass.rotation.set(0, 0, -rad(p.glassTilt));
    props.water.scale.set(1, Math.max(0.02, p.water), 1);
  }
  show(props.book, p.vBook, PROP_SCALE.book);
  if (props.book.visible) {
    set3(hv, L.handL);
    set3(hv2, L.handR);
    props.book.position.set((hv.x + hv2.x) / 2, (hv.y + hv2.y) / 2 - 0.07, (hv.z + hv2.z) / 2 + 0.05);
    props.book.rotation.set(rad(78), 0, 0);
    props.page.rotation.set(0, 0, rad(p.page));
  }
  props.fx.visible = p.fx > 0.03;
  props.fx.scale.setScalar(1.4 * p.fx);

  // Inclinación suave hacia el dedo/mouse: solo en reposo (en una actividad `tiltGain` es 0 y vuelve a cero)
  outer.rotation.y = MathUtils.lerp(outer.rotation.y, tilt.x * 0.3 * tiltGain, 0.1);
  outer.rotation.x = MathUtils.lerp(outer.rotation.x, tilt.y * 0.15 * tiltGain, 0.1);
}

const top = () => stack[stack.length - 1];

function resize() {
  const a = top();
  if (!a || !renderer) return;
  const w = Math.max(1, a.box.clientWidth * OVERSCAN);
  const h = Math.max(1, a.box.clientHeight * OVERSCAN);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function frame(now: number) {
  raf = 0;
  const a = top();
  if (!a || !renderer || !root || !ready) return;
  raf = requestAnimationFrame(frame);

  if (throttle30) {
    skip = !skip;
    if (skip) return;
  }
  const t0 = performance.now();
  const dt = Math.max(0.001, Math.min(0.05, (now - lastFrame) / 1000)); // nunca negativo: rAF puede llegar antes
  lastFrame = now;
  t += dt;

  if (wantedAct !== currentAct) {
    prevAct = currentAct;
    prevStart = actStart;
    currentAct = wantedAct;
    actStart = t; // cada actividad arranca su ciclo desde el principio (anticipación incluida)
    blendStart = t;
  }
  if (wantPoke) {
    wantPoke = false;
    pokeAt = t;
  }
  const lookNow = a.interactive ? look : { x: 0, y: 0 };
  const pokeT = pokeAt >= 0 ? t - pokeAt : -1;
  let target = computePose3(currentAct, currentAct === "idle" ? t : t - actStart, lookNow, pokeT);
  const w = blendStart >= 0 ? (t - blendStart) / BLEND : 1;
  if (w < 1) {
    const before = computePose3(prevAct, prevAct === "idle" ? t : t - prevStart, lookNow, pokeT);
    target = blendPose(before, target, w);
  }
  rig = stepRig3(rig, target, dt);
  apply(rig.pose, currentAct === "idle" ? 1 : 0);
  renderer.render(scene, camera);

  if (!a.announced) {
    a.announced = true;
    performance.mark("mascot:first-frame");
    a.onFirstFrame?.();
  }
  watchPerformance(performance.now() - t0, now);
}

/** Calidad adaptativa: si dibujar cuesta demasiado, primero 30 fps; si sigue mal, se pasa a 2D (una sola vez). */
function watchPerformance(work: number, now: number) {
  workAvg = workAvg * 0.9 + work * 0.1;
  if (!workSince) workSince = now;
  if (now - workSince < SLOW_WINDOW_S * 1000) return;
  workSince = now;
  if (workAvg <= SLOW_WORK_MS) {
    slowStrikes = 0;
    return;
  }
  if (!throttle30) {
    throttle30 = true;
    return;
  }
  if (++slowStrikes >= 1) {
    setMascotMode("2d");
    setMascotStatus("failed");
    toast("Pasamos el personaje a 2D para que la app ande más fluida. Podés cambiarlo en Ajustes.", { duration: 6000 });
  }
}

function startLoop() {
  const a = top();
  if (raf || !a || !a.visible || document.hidden || !ready) return;
  lastFrame = performance.now();
  raf = requestAnimationFrame(frame);
}
function stopLoop() {
  cancelAnimationFrame(raf);
  raf = 0;
}

const onVis = () => (document.hidden ? stopLoop() : startLoop());
const onMove = (e: PointerEvent) => {
  const a = top();
  if (!a || !a.interactive) return;
  const r = a.box.getBoundingClientRect();
  look.x = MathUtils.clamp((e.clientX - (r.left + r.width / 2)) / 260, -1, 1);
  look.y = MathUtils.clamp((e.clientY - (r.top + r.height * 0.5)) / 260, -1, 1);
};

function placeCanvas(box: HTMLElement) {
  if (!canvas) return;
  canvas.className = "pointer-events-none absolute";
  Object.assign(canvas.style, {
    left: `${(-(OVERSCAN - 1) / 2) * 100}%`,
    top: `${-(OVERSCAN - 1) * 0.72 * 100}%`,
    width: `${OVERSCAN * 100}%`,
    height: `${OVERSCAN * 100}%`,
  });
  box.appendChild(canvas);
  resize();
}

/** Crea el renderer (una sola vez). Lanza si el navegador no da WebGL. */
function createRenderer() {
  const dpr = window.devicePixelRatio || 1;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  canvas = document.createElement("canvas");
  renderer = new WebGLRenderer({
    canvas,
    alpha: true,
    antialias: dpr < 2, // con pantallas densas el aliasing casi no se ve
    powerPreference: "low-power",
  });
  mascotStats().renderers++;
  // Equipos justos (pocos núcleos o poca memoria): de entrada a 30 fps, que para el personaje alcanza
  const nav = navigator as Navigator & { deviceMemory?: number };
  throttle30 = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 3;
  // El personaje mide ~140 px: en celulares no hace falta más de 1,5 de densidad (menos píxeles que pintar)
  renderer.setPixelRatio(Math.min(dpr, coarse ? 1.5 : 2));
  renderer.toneMapping = NeutralToneMapping;

  // Luces simples (sin PMREM/RoomEnvironment: ahorra una pasada de GPU cara en celulares)
  const key = new DirectionalLight(0xffffff, 2.8);
  key.position.set(1.6, 3, 3.2);
  const fill = new DirectionalLight(0xe6fff2, 1.2);
  fill.position.set(-2.4, 1.2, 2);
  scene.add(key, fill, new HemisphereLight(0xffffff, 0xb8d8c8, 2.4));
  camera.position.set(0, 0.64, 4.2);
  camera.lookAt(0, 0.56, 0);

  // iOS suelta el contexto WebGL en segundo plano: mientras no está, se ve la bola 2D; al volver, sigue solo.
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    stopLoop();
    setMascotStatus("lost");
  });
  canvas.addEventListener("webglcontextrestored", () => {
    // three vuelve a subir geometrías, materiales y shaders a la GPU a partir del modelo ya parseado
    setMascotStatus("ready");
    startLoop();
  });
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pointermove", onMove, { passive: true });
}

/** Resuelve los nodos del modelo y le da los materiales propios (se hace una sola vez al cargar). */
function setupModel(model: Object3D) {
  const names = new Set<string>();
  model.traverse((o) => names.add(o.name));
  if (REQUIRED_NODES.some((n) => !names.has(n))) throw new Error("modelo incompleto");

  outer = model;
  scene.add(model);
  root = model.getObjectByName("Root")!;
  const get = (n: string) => model.getObjectByName(n)!;

  // Brazos: los segmentos se separan un poco y se mueven con IK
  const mk = (suffix: "L" | "R", side: 1 | -1): Arm => {
    const fore = get(`Fore_${suffix}`);
    const hand = get(`Hand_${suffix}`);
    fore.position.set(side * SEG1, 0, 0);
    hand.position.set(side * SEG2, 0, 0);
    return { arm: get(`Arm_${suffix}`), fore, hand, side };
  };
  armL = mk("L", 1);
  armR = mk("R", -1);
  bicep = get("Bicep");

  pupilL = get("Pupil_L");
  pupilR = get("Pupil_R");
  pupilRest.lx = pupilL.position.x;
  pupilRest.ly = pupilL.position.y;
  pupilRest.rx = pupilR.position.x;
  pupilRest.ry = pupilR.position.y;

  // Materiales propios (el archivo comparte Mat_White con los ojos): vaso con tinte y más opacidad,
  // agua saturada, libro con tapa verde muy oscura y páginas crema, para que se lean sobre fondo claro y oscuro.
  const own = (name: string, color: string, opacity?: number, roughness?: number) => {
    const mesh = get(name) as Mesh;
    const mat = (mesh.material as MeshStandardMaterial).clone();
    mat.color.set(color);
    if (roughness !== undefined) mat.roughness = roughness; // mate: sin reflejos que laven el color
    if (opacity !== undefined) {
      mat.transparent = true;
      mat.opacity = opacity;
    }
    mesh.material = mat;
  };
  own("Prop_Glass", "#6aa592", 0.68);
  own("Prop_Water", "#00c060", 0.95);
  // El agua se dibuja después del vaso (que no escribe profundidad) para que no la lave el gris del vidrio
  (get("Prop_Glass") as Mesh).renderOrder = 2;
  ((get("Prop_Glass") as Mesh).material as MeshStandardMaterial).depthWrite = false;
  (get("Prop_Water") as Mesh).renderOrder = 3;
  own("Prop_Book", "#17352a", undefined, 0.9);
  own("Prop_BookPage", "#f6efd8", undefined, 0.9);

  props.dumbbell = get("Prop_Dumbbell");
  props.glass = get("Prop_Glass");
  props.water = get("Prop_Water");
  props.book = get("Prop_Book");
  props.page = get("Prop_BookPage");
  props.fx = get("FX");

  // La mancuerna del archivo trae triángulos con índices fuera de rango (apuntan a vértices que no existen y
  // dibujan una cuña negra gigante): se descartan esos triángulos.
  model.traverse((o) => {
    const g = (o as Mesh).geometry;
    const idx = g?.index;
    if (!idx) return;
    const n = g.attributes.position.count;
    const keep: number[] = [];
    for (let i = 0; i + 2 < idx.count; i += 3) {
      const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
      if (a < n && b < n && c < n) keep.push(a, b, c);
    }
    if (keep.length !== idx.count) g.setIndex(keep);
  });

  model.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || !m.morphTargetDictionary || !m.morphTargetInfluences) return;
    for (const [name, index] of Object.entries(m.morphTargetDictionary)) {
      if (!morphs.has(name)) morphs.set(name, []);
      morphs.get(name)!.push({ mesh: m, index });
    }
  });
  apply(rig.pose, 1);
}

/**
 * Crea el renderer, baja y parsea el modelo y compila los shaders. Idempotente: el modelo se baja una sola vez.
 * Deja el estado en "ready" o "failed".
 */
export function loadEngine(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      createRenderer();
      mascotStats().loads++;
      const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
      performance.mark("mascot:model-loaded");
      setupModel(gltf.scene);
      // Compilar acá evita que los shaders se armen en el primer cuadro visible (se vería un tirón)
      renderer!.setSize(8, 8, false);
      renderer!.compile(scene, camera);
      ready = true;
      setMascotStatus("ready");
      startLoop();
    } catch {
      // Sin WebGL, contexto rechazado o modelo roto: se queda la bola 2D, sin romper nada.
      setMascotStatus("failed");
    }
  })();
  return loadPromise;
}

/**
 * Engancha el canvas único en `box` (que debe estar posicionado). Si ya había otro enganchado, este pasa a verse
 * y, al soltarlo, el canvas vuelve al anterior. Hay que llamarlo después de `loadEngine()`.
 */
export function attachMascot(box: HTMLElement, opts: AttachOptions): MascotHandle {
  const att: Attachment = {
    box,
    interactive: opts.interactive,
    onFirstFrame: opts.onFirstFrame,
    announced: false,
    visible: true,
    io: new IntersectionObserver(([e]) => {
      att.visible = e.isIntersecting;
      if (att.visible) startLoop();
      else stopLoop();
    }),
    ro: new ResizeObserver(() => {
      if (top() === att) resize();
    }),
  };
  att.io.observe(box);
  att.ro.observe(box);
  stack.push(att);
  wantedAct = opts.activity;
  placeCanvas(box);
  startLoop();

  return {
    setActivity(a) {
      if (top() === att) wantedAct = a;
    },
    poke() {
      if (top() === att) wantPoke = true;
    },
    detach() {
      att.io.disconnect();
      att.ro.disconnect();
      const i = stack.indexOf(att);
      if (i >= 0) stack.splice(i, 1);
      const next = top();
      if (next) {
        placeCanvas(next.box);
        startLoop();
      } else {
        canvas?.remove();
        stopLoop();
      }
    },
  };
}
