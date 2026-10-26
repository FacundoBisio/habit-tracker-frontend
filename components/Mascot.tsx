"use client";

import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { ACTIVITY_LABEL, playActivity, useActivityOverride, type Activity } from "@/lib/mascot";
import { useMascot3dEnabled } from "@/lib/mascot-3d";
import {
  GROUND, H, W, bodyPath, computePose, createJelly, outline, solveArms, stepJelly, stepRig, type Jelly, type Look, type Pose, type V,
} from "@/lib/slime-rig";

const GEL = "color-mix(in srgb, var(--accent) 82%, white)";
const GEL_DARK = "color-mix(in srgb, var(--accent) 62%, black)";
const INK = "#0a0f0c";

// Elementos por SVG, buscados una sola vez (render corre en cada cuadro).
const cache = new WeakMap<SVGSVGElement, Map<string, Element | null>>();
const pts = (...p: V[]) => p.map((v) => `${v[0].toFixed(1)},${v[1].toFixed(1)}`).join(" ");
const rot = (p: V, c: V, deg: number): V => {
  const r = (deg * Math.PI) / 180;
  const x = p[0] - c[0];
  const y = p[1] - c[1];
  return [c[0] + x * Math.cos(r) - y * Math.sin(r), c[1] + x * Math.sin(r) + y * Math.cos(r)];
};

/** Escribe la pose actual en el SVG (sin pasar por React: se llama en cada cuadro). */
function render(svg: SVGSVGElement, p: Pose, jelly: Jelly, activity: Activity, t: number) {
  let els = cache.get(svg);
  if (!els) cache.set(svg, (els = new Map()));
  const q = (name: string) => {
    if (!els.has(name)) els.set(name, svg.querySelector(`[data-p="${name}"]`));
    return els.get(name) ?? null;
  };
  const set = (name: string, attrs: Record<string, string | number>) => {
    const el = q(name);
    if (el) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  };
  const show = (name: string, on: boolean) => q(name)?.setAttribute("display", on ? "inline" : "none");

  const baseY = GROUND - p.lift;
  const base: V = [p.bx, baseY];
  const top = outline(p, jelly);
  const arms = solveArms(p);

  // Sombra y charquito: se achican/desvanecen cuando el slime está en el aire
  const air = Math.min(1, p.lift / 60);
  set("shadow", { cx: p.bx, rx: W * p.sx * (1 - air * 0.5), opacity: 0.16 * (1 - air * 0.7) });
  set("puddle", { cx: p.bx, rx: W * p.sx * 1.12, opacity: 0.22 * (1 - air) });

  // Cuerpo + brillo + burbujas internas
  set("body", { d: bodyPath(top, p) });
  const i1 = 3;
  const i2 = 5;
  const sh = (i: number): V => {
    const v = top[i];
    return [v[0] + (p.bx - v[0]) * 0.16, v[1] + (baseY - v[1]) * 0.16];
  };
  set("shine", { d: `M${sh(i1)[0].toFixed(1)} ${sh(i1)[1].toFixed(1)} Q${sh(4)[0].toFixed(1)} ${(sh(4)[1] - 4).toFixed(1)} ${sh(i2)[0].toFixed(1)} ${sh(i2)[1].toFixed(1)}` });
  const rise = activity === "meditate" ? 0.5 : activity === "sleep" ? 0.12 : 0.22;
  for (let i = 0; i < 3; i++) {
    const k = (t * rise + i / 3) % 1;
    set(`b${i}`, {
      cx: p.bx + (i - 1) * 17 * p.sx + Math.sin(t * 1.2 + i * 2) * 3,
      cy: baseY - H * p.sy * (0.12 + 0.55 * k),
      r: (2.2 + i * 0.9) * (1 - k * 0.3),
      opacity: 0.4 * Math.sin(k * Math.PI),
    });
  }

  // Cara: sigue la parte alta del cuerpo (con un poco de bamboleo de la gelatina)
  const mid = Math.floor(top.length / 2);
  const faceBase: V = [p.bx, baseY - H * p.sy * 0.5 + jelly.o[mid] * 0.5];
  const face = rot(faceBase, base, p.tilt);
  set("face", { transform: `translate(${face[0].toFixed(1)} ${face[1].toFixed(1)}) rotate(${p.tilt}) scale(${Math.min(1.12, 0.92 + p.sx * 0.08)} ${Math.min(1.1, 0.94 + p.sy * 0.06)})` });
  for (const [side, sign] of [["L", -1], ["R", 1]] as const) {
    const ex = sign * 15;
    set(`pupil${side}`, { cx: ex + p.lookX * 3.6, cy: -2 + p.lookY * 3.4 });
    set(`hi${side}`, { cx: ex + p.lookX * 3.6 + 1.8, cy: -5 + p.lookY * 3.4 });
    set(`lid${side}`, { height: 24 * Math.max(0, Math.min(1, p.lid)) });
    set(`lash${side}`, { opacity: p.lid > 0.85 ? 1 : 0 });
    const b = -19 - p.brow * 3.5;
    const inner = b + Math.max(0, -p.brow) * 6;
    set(`brow${side}`, { d: `M${sign * 25} ${b} Q${sign * 15} ${(b + inner) / 2 - 3} ${sign * 6} ${inner}` });
  }
  set("mouth", {
    d: `M${-p.mouthW} 0 Q0 ${p.mouthC} ${p.mouthW} 0 Q0 ${p.mouthC + p.mouthO} ${-p.mouthW} 0Z`,
    "fill-opacity": p.mouthO > 1.5 ? 1 : 0,
  });

  // Brazos (pseudópodos): solo se dibujan si están afuera; el derecho del gimnasio es grueso y musculoso
  const lifting = activity === "lift";
  const drawArm = (side: "L" | "R", s: V, e: V, h: V, ext: number, thick: number) => {
    const on = ext > 0.04;
    for (const n of [`arm${side}o`, `arm${side}`, `hand${side}`]) show(n, on);
    if (!on) return;
    const d = pts(s, e, h);
    const w = (7 + 3 * ext) * thick;
    set(`arm${side}o`, { points: d, "stroke-width": w + 3 });
    set(`arm${side}`, { points: d, "stroke-width": w });
    set(`hand${side}`, { cx: h[0], cy: h[1], r: (5.2 + 2.4 * ext) * Math.min(1.5, thick) });
  };
  drawArm("L", arms.shoulderL, arms.elbowL, arms.handL, p.armLe, 1);
  drawArm("R", arms.shoulderR, arms.elbowR, arms.handR, p.armRe, lifting ? 1.65 : 1);

  show("bicep", lifting);
  if (lifting) {
    const r = 8 + 6.5 * p.flex;
    set("bicep", { cx: arms.bicep[0] + 2, cy: arms.bicep[1] - 1 - p.flex * 2, r });
    set("bicepCrease", { d: `M${(arms.bicep[0] - 3).toFixed(1)} ${(arms.bicep[1] + 4 + p.flex * 4).toFixed(1)} Q${(arms.bicep[0] + 2).toFixed(1)} ${(arms.bicep[1] + 7 + p.flex * 5).toFixed(1)} ${(arms.bicep[0] + 8).toFixed(1)} ${(arms.bicep[1] + 4 + p.flex * 4).toFixed(1)}`, opacity: p.flex });
    set("bicepShine", { cx: arms.bicep[0] - 1 - p.flex, cy: arms.bicep[1] - 4 - p.flex * 3, rx: 1.6 + p.flex * 1.4, ry: 3 + p.flex * 2, opacity: 0.35 + p.flex * 0.4 });
  }

  // Props
  show("dumbbell", lifting);
  if (lifting) set("dumbbell", { transform: `translate(${arms.handR[0]} ${arms.handR[1]}) rotate(${-4 + p.curl * 8})` });
  const drinking = activity === "drink";
  show("glass", drinking);
  if (drinking) {
    set("glass", { transform: `translate(${arms.handR[0] + 1} ${arms.handR[1] - 7}) rotate(${-p.glassTilt})` });
    const water = Math.max(0, Math.min(1, p.water));
    set("water", { y: 12 - 22 * water, height: 22 * water });
  }
  const reading = activity === "read";
  show("book", reading);
  if (reading) {
    set("book", { transform: `translate(${(arms.handL[0] + arms.handR[0]) / 2} ${(arms.handL[1] + arms.handR[1]) / 2 - 5})` });
    set("bookPage", { transform: `scale(${Math.cos(p.page * Math.PI * 0.5) || 0.001} 1)` });
  }

  // Partículas
  show("zzz", activity === "sleep");
  show("snot", activity === "sleep");
  if (activity === "sleep") {
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.45 + i / 3) % 1;
      set(`z${i}`, { transform: `translate(${p.bx + 40 + k * 14} ${baseY - 50 - k * 36}) scale(${0.7 + k * 0.7})`, opacity: Math.sin(k * Math.PI) });
    }
    set("snot", { cx: face[0] + 11, cy: face[1] + 6, r: 2.5 + (Math.sin(t * 1.9) + 1) * 3.2, opacity: 0.75 });
  }
  show("notes", activity === "dance");
  if (activity === "dance") {
    for (let i = 0; i < 2; i++) {
      const k = (t * 0.55 + i / 2) % 1;
      set(`n${i}`, { transform: `translate(${(i === 0 ? 18 : 142) + Math.sin(k * 6) * 5} ${96 - k * 54})`, opacity: Math.sin(k * Math.PI) });
    }
  }
  show("rings", activity === "meditate");
  if (activity === "meditate") {
    for (let i = 0; i < 2; i++) {
      const k = (t * 0.3 + i / 2) % 1;
      set(`ring${i}`, { cx: p.bx, cy: baseY - 26, rx: 46 + k * 38, ry: 36 + k * 30, opacity: 0.4 * (1 - k) });
    }
  }
  show("speed", activity === "run");
  if (activity === "run") {
    for (let i = 0; i < 3; i++) {
      const k = (t * 3.4 + i / 3) % 1;
      set(`s${i}`, { x1: 10 + k * 8, x2: 30 + k * 8, y1: 84 + i * 15, y2: 84 + i * 15, opacity: 0.5 * (1 - k) });
    }
    for (let i = 0; i < 2; i++) {
      const k = (t * 2.4 + i * 0.5) % 1;
      set(`dust${i}`, { cx: p.bx - 34 - k * 22 - i * 8, cy: GROUND - 4 - k * 8, r: 2.5 + k * 4, opacity: 0.35 * (1 - k) });
    }
  }
  const sparkle = activity === "celebrate" || (lifting && p.flex > 0.85);
  show("sparks", sparkle);
  if (sparkle) {
    const c: V = lifting ? arms.bicep : [p.bx, baseY - H * 0.6];
    for (let i = 0; i < 4; i++) {
      const k = (t * 1.1 + i / 4) % 1;
      const a = i * 1.7 + 0.4;
      set(`sp${i}`, {
        transform: `translate(${c[0] + Math.cos(a) * (28 + k * 26)} ${c[1] + Math.sin(a) * (24 + k * 22) - k * 8}) scale(${1 - k * 0.55}) rotate(${k * 160})`,
        opacity: Math.sin(k * Math.PI),
      });
    }
  }
  const sweat = lifting && p.curl > 0.2 && p.curl < 1;
  show("sweat", sweat);
  if (sweat) {
    const k = (t * 1.4) % 1;
    set("sweat", { transform: `translate(${face[0] + 30} ${face[1] - 14 + k * 26}) scale(${0.8 + k * 0.2})`, opacity: 0.85 * (1 - k * 0.6) });
  }
}

/**
 * Slime articulado: cuerpo de gelatina con física de resortes (rebota, se aplasta, se estira y
 * tiembla al aterrizar), cara expresiva con mirada que sigue al usuario, brazos que salen del
 * cuerpo y animación procedural por actividad (ver `lib/slime-rig.ts`). Se actualiza con
 * `requestAnimationFrame` escribiendo atributos directamente (sin re-renders de React), se pausa
 * fuera de pantalla o en segundo plano y, con "menos movimiento", dibuja una sola pose.
 */
function SlimeFigure({ activity, size = 128, interactive = true }: { activity: Activity; size?: number; interactive?: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const activityRef = useRef<Activity>(activity);
  const lookRef = useRef<Look>({ x: 0, y: 0 });
  const poked = useRef(0);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-12, 12]), { stiffness: 180, damping: 16 });
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [9, -9]), { stiffness: 180, damping: 16 });

  useEffect(() => {
    activityRef.current = activity;
  }, [activity]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let pose: Pose = computePose(activityRef.current, 0);
    let jelly = createJelly(pose);
    if (reduce) {
      render(svg, pose, jelly, activityRef.current, 0);
      return;
    }

    let raf = 0;
    let last = performance.now();
    let t = 0;
    let actStart = 0;
    let current = activityRef.current;
    let visible = true;

    const frame = (now: number) => {
      const dt = Math.max(0.001, Math.min(0.05, (now - last) / 1000)); // nunca negativo: rAF puede llegar antes que `last`
      last = now;
      t += dt;
      if (activityRef.current !== current) {
        current = activityRef.current;
        actStart = t; // cada actividad arranca su ciclo desde el principio (anticipación incluida)
      }
      const local = current === "idle" ? t : t - actStart;
      const target = computePose(current, local, interactive ? lookRef.current : { x: 0, y: 0 });
      // Un toque directo hace "boing": un rebote corto extra sobre cualquier pose
      if (poked.current > 0) {
        poked.current = Math.max(0, poked.current - dt);
        const k = poked.current / 0.45;
        target.lift += Math.sin((1 - k) * Math.PI) * 8;
        target.sy += Math.sin((1 - k) * Math.PI * 2) * 0.04;
      }
      pose = stepRig(pose, target, dt);
      jelly = stepJelly(jelly, pose, dt);
      render(svg, pose, jelly, current, t);
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (raf || !visible || document.hidden) return;
      last = performance.now();
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
    io.observe(svg);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);

    const onMove = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      lookRef.current = {
        x: Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 260)),
        y: Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height * 0.5)) / 260)),
      };
    };
    if (interactive) window.addEventListener("pointermove", onMove, { passive: true });

    start();
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pointermove", onMove);
    };
  }, [interactive]);

  return (
    <div className="[perspective:700px]">
      <motion.div
        role="img"
        aria-label={ACTIVITY_LABEL[activity]}
        className="shrink-0 touch-pan-y"
        style={{ rotateX, rotateY, transformStyle: "preserve-3d", width: size, height: size * 0.875 }}
        onPointerMove={(e) => {
          if (!interactive) return;
          const r = e.currentTarget.getBoundingClientRect();
          px.set((e.clientX - r.left) / r.width - 0.5);
          py.set((e.clientY - r.top) / r.height - 0.5);
        }}
        onPointerLeave={() => {
          px.set(0);
          py.set(0);
        }}
        onClick={() => {
          if (!interactive) return;
          poked.current = 0.45;
          playActivity("dance", 3500);
        }}
        whileTap={interactive ? { scale: 0.95 } : undefined}
      >
        <svg ref={svgRef} width={size} height={size * 0.875} viewBox="8 30 144 126" overflow="visible" aria-hidden>
          <defs>
            <linearGradient id="sl-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: "color-mix(in srgb, var(--accent) 52%, white)" }} />
              <stop offset="55%" style={{ stopColor: "var(--accent)" }} />
              <stop offset="100%" style={{ stopColor: "color-mix(in srgb, var(--accent) 70%, black)" }} />
            </linearGradient>
            <radialGradient id="sl-glow" cx="0.5" cy="0.62" r="0.55">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <clipPath id="sl-eyeL"><ellipse cx="-15" cy="-2" rx="9.5" ry="11.5" /></clipPath>
            <clipPath id="sl-eyeR"><ellipse cx="15" cy="-2" rx="9.5" ry="11.5" /></clipPath>
            <clipPath id="sl-glassc"><path d="M-7.5 -12H7.5L5.5 12H-5.5Z" /></clipPath>
          </defs>

          <ellipse data-p="shadow" cy={GROUND + 3} ry="5" fill="var(--fg)" />
          <ellipse data-p="puddle" cy={GROUND + 1} ry="4.5" fill="var(--accent)" />

          <g data-p="rings" display="none" fill="none" stroke="var(--accent)" strokeWidth="2">
            <ellipse data-p="ring0" /><ellipse data-p="ring1" />
          </g>
          <g data-p="speed" display="none">
            <g stroke="var(--fg)" strokeWidth="2.6" strokeLinecap="round"><line data-p="s0" /><line data-p="s1" /><line data-p="s2" /></g>
            <g fill="var(--accent)"><circle data-p="dust0" /><circle data-p="dust1" /></g>
          </g>

          {/* Cuerpo de gelatina */}
          <path data-p="body" fill="url(#sl-body)" fillOpacity="0.96" stroke={GEL_DARK} strokeOpacity="0.55" strokeWidth="1.6" strokeLinejoin="round" />
          <path data-p="body" fill="url(#sl-glow)" />
          <g fill="#fff">
            <circle data-p="b0" /><circle data-p="b1" /><circle data-p="b2" />
          </g>
          <path data-p="shine" fill="none" stroke="#fff" strokeOpacity="0.62" strokeWidth="5" strokeLinecap="round" />

          {/* Cara */}
          <g data-p="face">
            {(["L", "R"] as const).map((s) => {
              const sign = s === "L" ? -1 : 1;
              const ex = sign * 15;
              return (
                <g key={s}>
                  <ellipse cx={ex} cy="-2" rx="9.5" ry="11.5" fill="#fff" />
                  <g clipPath={`url(#sl-eye${s})`}>
                    <circle data-p={`pupil${s}`} cx={ex} cy="-2" r="5.6" fill={INK} />
                    <circle data-p={`hi${s}`} cx={ex + 1.8} cy="-5" r="1.9" fill="#fff" />
                    <rect data-p={`lid${s}`} x={ex - 11} y="-15" width="22" height="0" fill={GEL} />
                  </g>
                  <path data-p={`lash${s}`} d={`M${ex - 8} 0 Q${ex} 7 ${ex + 8} 0`} stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" opacity="0" />
                  <path data-p={`brow${s}`} stroke={INK} strokeOpacity="0.85" strokeWidth="3" strokeLinecap="round" fill="none" />
                </g>
              );
            })}
            <g fill="#fff" opacity="0.28"><circle cx="-29" cy="13" r="5" /><circle cx="29" cy="13" r="5" /></g>
            <g transform="translate(0 15)">
              <path data-p="mouth" stroke={INK} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill={INK} />
            </g>
          </g>
          <circle data-p="snot" display="none" fill="#fff" fillOpacity="0.55" stroke="var(--fg)" strokeOpacity="0.3" strokeWidth="1" />

          {/* Brazos de gelatina, bíceps y manos */}
          {(["L", "R"] as const).map((s) => (
            <g key={s}>
              <polyline data-p={`arm${s}o`} fill="none" stroke={GEL_DARK} strokeLinecap="round" strokeLinejoin="round" />
              <polyline data-p={`arm${s}`} fill="none" stroke={GEL} strokeLinecap="round" strokeLinejoin="round" />
            </g>
          ))}
          <g data-p="bicep" display="none">
            <circle data-p="bicep" fill={GEL} stroke={GEL_DARK} strokeOpacity="0.6" strokeWidth="2" />
            <ellipse data-p="bicepShine" fill="#fff" />
            <path data-p="bicepCrease" fill="none" stroke={GEL_DARK} strokeOpacity="0.55" strokeWidth="1.6" strokeLinecap="round" />
          </g>

          {/* Props */}
          <g data-p="dumbbell" display="none">
            <line x1="-11" y1="0" x2="11" y2="0" stroke={INK} strokeWidth="5" strokeLinecap="round" />
            <rect x="-19" y="-10" width="8" height="20" rx="2.5" fill={INK} />
            <rect x="11" y="-10" width="8" height="20" rx="2.5" fill={INK} />
            <rect x="-24" y="-7" width="5.5" height="14" rx="2" fill={INK} opacity="0.7" />
            <rect x="18.5" y="-7" width="5.5" height="14" rx="2" fill={INK} opacity="0.7" />
          </g>
          <g data-p="glass" display="none">
            <path d="M-7.5 -12H7.5L5.5 12H-5.5Z" fill="var(--surface-solid)" fillOpacity="0.55" stroke="var(--fg)" strokeWidth="2" strokeLinejoin="round" />
            <rect data-p="water" x="-8" y="-10" width="16" height="22" fill="var(--accent)" opacity="0.7" clipPath="url(#sl-glassc)" />
          </g>
          <g data-p="book" display="none">
            <path d="M0 4 -26 -2V26L0 32Z" fill="var(--surface-solid)" stroke="var(--fg)" strokeWidth="2.4" strokeLinejoin="round" />
            <path d="M0 4 26 -2V26L0 32Z" fill="var(--surface-solid)" stroke="var(--fg)" strokeWidth="2.4" strokeLinejoin="round" />
            <path d="M-20 6l14 3M-20 12l14 3M-20 18l14 3M6 9l14-3M6 15l14-3M6 21l14-3" stroke="var(--fg)" strokeWidth="1.4" opacity="0.35" strokeLinecap="round" />
            <path data-p="bookPage" d="M0 4 26 -2V26L0 32Z" fill="var(--surface-solid)" stroke="var(--fg)" strokeWidth="1.8" strokeLinejoin="round" />
          </g>

          {/* Manos (puños de gelatina) al frente */}
          {(["L", "R"] as const).map((s) => (
            <circle key={s} data-p={`hand${s}`} fill={GEL} stroke={GEL_DARK} strokeOpacity="0.7" strokeWidth="1.8" />
          ))}

          {/* Partículas */}
          <path data-p="sweat" display="none" d="M0 -6C3 -1 5 2 0 6C-5 2 -3 -1 0 -6Z" fill="#fff" stroke="var(--fg)" strokeOpacity="0.35" />
          <g data-p="zzz" display="none" fill="var(--fg)" fontWeight="800" fontSize="16">
            {[0, 1, 2].map((i) => (<text key={i} data-p={`z${i}`}>z</text>))}
          </g>
          <g data-p="notes" display="none" stroke="var(--fg)" strokeWidth="2.6" fill="none" strokeLinecap="round">
            {[0, 1].map((i) => (
              <g key={i} data-p={`n${i}`}><path d="M0 0v-14l8-2v14" /><circle cx="-2.5" cy="1" r="3.4" fill="var(--fg)" stroke="none" /></g>
            ))}
          </g>
          <g data-p="sparks" display="none" fill="var(--accent)">
            {[0, 1, 2, 3].map((i) => (
              <path key={i} data-p={`sp${i}`} d="M0 -7 1.9 -1.9 7 0 1.9 1.9 0 7 -1.9 1.9 -7 0 -1.9 -1.9Z" />
            ))}
          </g>
        </svg>
      </motion.div>
    </div>
  );
}

// three.js y el modelo se descargan solo si se usa el 3D (el módulo entero es de carga diferida).
const Mascot3D = dynamic(() => import("./Mascot3D"), { ssr: false });

/**
 * Personaje del usuario: la esfera 3D si el dispositivo tiene WebGL 2, el usuario no pidió "menos
 * movimiento" y eligió 3D; si no (o mientras carga / si falla), el slime 2D. Una sola caja con el
 * mismo tamaño en ambos casos, así no hay saltos de layout al cambiar.
 */
export function MascotFigure({ activity, size = 128, interactive = true }: { activity: Activity; size?: number; interactive?: boolean }) {
  const enabled = useMascot3dEnabled();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!enabled || failed) return <SlimeFigure activity={activity} size={size} interactive={interactive} />;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size * 0.875 }}>
      {!ready && <SlimeFigure activity={activity} size={size} interactive={interactive} />}
      <Mascot3D
        activity={activity}
        size={size}
        interactive={interactive}
        ready={ready}
        onReady={() => setReady(true)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export function Mascot({ message }: { message: string }) {
  // Lo último que se tocó manda durante 10 s; después vuelve al estado por defecto.
  const override = useActivityOverride();
  const activity: Activity = override ?? "idle";

  return (
    <div className="mb-5 flex items-end gap-1">
      <MascotFigure activity={activity} size={140} />
      <div className="relative min-w-0 flex-1 pb-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={message}
            initial={{ opacity: 0, scale: 0.94, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.1 } }}
            transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className="card relative origin-bottom-left rounded-[1.25rem] rounded-bl-md px-4 py-3 text-[14px] leading-snug font-medium"
          >
            {message}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
