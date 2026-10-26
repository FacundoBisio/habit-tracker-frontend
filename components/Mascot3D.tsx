"use client";

import { useEffect, useRef } from "react";
import {
  DirectionalLight, HemisphereLight, MathUtils, NeutralToneMapping, PMREMGenerator, PerspectiveCamera, Quaternion,
  Scene, Vector3, WebGLRenderer, type Mesh, type MeshStandardMaterial, type Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ACTIVITY_LABEL, type Activity } from "@/lib/mascot";
import { MODEL_URL, REQUIRED_NODES } from "@/lib/mascot-3d";
import { SEG1, SEG2, blendPose, computePose3, createRig, solveLimbs3, stepRig3, volumeScale, type Pose3, type V3 } from "@/lib/mascot-3d-rig";

/** El lienzo es más grande que la caja del personaje para no recortar saltos ni brazos en alto. */
const OVERSCAN = 1.3;

/** Tamaño de los props respecto del modelo original (se leen mejor a ~140 px de ancho). */
const PROP_SCALE = { dumbbell: 2.0, glass: 2.3, book: 2.0 } as const;

const rad = MathUtils.degToRad;

interface Props {
  activity: Activity;
  size: number;
  interactive: boolean;
  /** Cuando es true el 3D "toma el relevo" (accesibilidad y visibilidad). */
  ready: boolean;
  onReady: () => void;
  onError: () => void;
}

/**
 * Personaje 3D (esfera) cargado de `public/models/mascot.glb`. NO usa los clips del archivo: cada cuadro
 * calcula una pose con `lib/mascot-3d-rig.ts` y mueve los nodos del modelo (cuerpo, cara por morph targets,
 * brazos con IK, props en las manos). Este módulo (y three.js) se descarga solo cuando se usa.
 */
export default function Mascot3D({ activity, size, interactive, ready, onReady, onError }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const activityRef = useRef<Activity>(activity);
  const pokeRef = useRef(0);
  const tilt = useRef({ x: 0, y: 0 });
  const look = useRef({ x: 0, y: 0 });
  const cbs = useRef({ onReady, onError });

  useEffect(() => {
    activityRef.current = activity;
    cbs.current = { onReady, onError };
  });

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;

    // El canvas se crea acá (no en el JSX) y se descarta al limpiar: React puede montar, desmontar y volver
    // a montar el efecto, y un canvas cuyo contexto WebGL ya se perdió no se puede reutilizar.
    const canvas = document.createElement("canvas");
    canvas.className = "pointer-events-none absolute";
    Object.assign(canvas.style, {
      left: `${(-(OVERSCAN - 1) / 2) * 100}%`,
      top: `${-(OVERSCAN - 1) * 0.72 * 100}%`,
      width: `${OVERSCAN * 100}%`,
      height: `${OVERSCAN * 100}%`,
    });
    box.appendChild(canvas);

    let disposed = false;
    let raf = 0;
    let visible = true;
    let announced = false;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      // Sin WebGL (o contexto rechazado): se queda el personaje 2D, sin romper nada.
      canvas.remove();
      cbs.current.onError();
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = NeutralToneMapping;

    const scene = new Scene();
    const pmrem = new PMREMGenerator(renderer);
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTexture;
    scene.environmentIntensity = 0.6;
    const key = new DirectionalLight(0xffffff, 1.5);
    key.position.set(1.6, 3, 3.2);
    scene.add(key, new HemisphereLight(0xffffff, 0x9ab8a8, 0.55));

    const camera = new PerspectiveCamera(28, 1, 0.1, 50);
    camera.position.set(0, 0.64, 4.2);
    camera.lookAt(0, 0.56, 0);

    const resize = () => {
      const w = Math.max(1, box.clientWidth * OVERSCAN);
      const h = Math.max(1, box.clientHeight * OVERSCAN);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(box);

    // --- Nodos del modelo (se resuelven al cargar) ---
    type Arm = { arm: Object3D; fore: Object3D; hand: Object3D; side: 1 | -1 };
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
    const poseArm = (a: Arm, S: V3, E: V3, H: V3, scale: number) => {
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
    };

    const apply = (p: Pose3, t: number, tiltGain: number) => {
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
      outer.rotation.y = MathUtils.lerp(outer.rotation.y, tilt.current.x * 0.3 * tiltGain, 0.1);
      outer.rotation.x = MathUtils.lerp(outer.rotation.x, tilt.current.y * 0.15 * tiltGain, 0.1);
    };

    // --- Bucle de animación ---
    let rig = createRig();
    let t = 0;
    let actStart = 0;
    let currentAct: Activity = activityRef.current;
    let prevAct: Activity = currentAct;
    let prevStart = 0;
    let blendStart = -1;
    let pokeAt = -1;
    const BLEND = 0.3; // mezcla corta entre actividades: las dos poses no se pisan
    const last = { t: performance.now() };

    const frame = (now: number) => {
      if (disposed || !root) return;
      const dt = Math.max(0.001, Math.min(0.05, (now - last.t) / 1000)); // nunca negativo: rAF puede llegar antes que `last`
      last.t = now;
      t += dt;
      if (activityRef.current !== currentAct) {
        prevAct = currentAct;
        prevStart = actStart;
        currentAct = activityRef.current;
        actStart = t; // cada actividad arranca su ciclo desde el principio (anticipación incluida)
        blendStart = t;
      }
      if (pokeRef.current > 0) {
        pokeRef.current = 0;
        pokeAt = t;
      }
      const lookNow = interactive ? look.current : { x: 0, y: 0 };
      const pokeT = pokeAt >= 0 ? t - pokeAt : -1;
      let target = computePose3(currentAct, currentAct === "idle" ? t : t - actStart, lookNow, pokeT);
      const w = blendStart >= 0 ? (t - blendStart) / BLEND : 1;
      if (w < 1) {
        const before = computePose3(prevAct, prevAct === "idle" ? t : t - prevStart, lookNow, pokeT);
        target = blendPose(before, target, w);
      }
      rig = stepRig3(rig, target, dt);
      apply(rig.pose, t, currentAct === "idle" ? 1 : 0);
      renderer.render(scene, camera);
      if (!announced) {
        announced = true;
        cbs.current.onReady();
      }
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (raf || !visible || document.hidden || !root) return;
      last.t = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(box);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);

    const onMove = (e: PointerEvent) => {
      const r = box.getBoundingClientRect();
      look.current = {
        x: MathUtils.clamp((e.clientX - (r.left + r.width / 2)) / 260, -1, 1),
        y: MathUtils.clamp((e.clientY - (r.top + r.height * 0.5)) / 260, -1, 1),
      };
    };
    if (interactive) window.addEventListener("pointermove", onMove, { passive: true });

    new GLTFLoader()
      .loadAsync(MODEL_URL)
      .then((gltf) => {
        if (disposed) return;
        // Contrato: si el modelo no trae lo esperado, se usa el 2D en vez de mostrar algo roto.
        const names = new Set<string>();
        gltf.scene.traverse((o) => names.add(o.name));
        if (REQUIRED_NODES.some((n) => !names.has(n))) throw new Error("modelo incompleto");

        const model = gltf.scene;
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

        apply(rig.pose, 0, 1);
        start();
      })
      .catch(() => {
        if (!disposed) cbs.current.onError();
      });

    return () => {
      disposed = true;
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
      scene.traverse((o) => {
        const m = o as unknown as { geometry?: { dispose(): void }; material?: { dispose(): void } | { dispose(): void }[] };
        m.geometry?.dispose();
        if (Array.isArray(m.material)) m.material.forEach((x) => x.dispose());
        else m.material?.dispose();
      });
      envTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [interactive]);

  return (
    <div
      ref={boxRef}
      role={ready ? "img" : undefined}
      aria-label={ready ? ACTIVITY_LABEL[activity] : undefined}
      aria-hidden={ready ? undefined : true}
      className="absolute inset-0 touch-pan-y"
      style={{ width: size, height: size * 0.875, opacity: ready ? 1 : 0, transition: "opacity 0.3s ease" }}
      onPointerMove={(e) => {
        if (!interactive) return;
        const r = e.currentTarget.getBoundingClientRect();
        tilt.current = { x: (e.clientX - r.left) / r.width - 0.5, y: (e.clientY - r.top) / r.height - 0.5 };
      }}
      onPointerLeave={() => {
        tilt.current = { x: 0, y: 0 };
      }}
      onClick={() => {
        if (!interactive) return;
        pokeRef.current = 1; // un solo efecto: el "boing" corto (no cambia la actividad)
      }}
    />
  );
}
