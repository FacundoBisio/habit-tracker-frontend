"use client";

import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, useState } from "react";
import { playActivity, useActivityOverride, type Activity } from "@/lib/mascot";

const LOOP = { repeat: Infinity, ease: "easeInOut" as const };
const SKIN = "color-mix(in srgb, var(--accent) 78%, black)";
const ARM = { stroke: "var(--accent)", strokeWidth: 6, strokeLinecap: "round" as const, fill: "none" };
const PROP = "var(--fg)";

/** Brazo `M x y L x y` que se mueve entre posiciones (todas con la misma forma, para poder interpolar). */
function Arm({ frames, duration = 1.6, delay = 0 }: { frames: string[]; duration?: number; delay?: number }) {
  return (
    <motion.path
      {...ARM}
      initial={{ d: frames[0] }}
      animate={{ d: frames }}
      transition={{ duration, delay, times: frames.map((_, i) => i / (frames.length - 1)), ...LOOP }}
    />
  );
}

const StaticArm = ({ d }: { d: string }) => <path d={d} {...ARM} />;

function Legs({ run = false }: { run?: boolean }) {
  if (!run) {
    return (
      <g>
        <path d="M50 84 L50 97" stroke={SKIN} strokeWidth="7" strokeLinecap="round" />
        <path d="M70 84 L70 97" stroke={SKIN} strokeWidth="7" strokeLinecap="round" />
        <ellipse cx="48" cy="99" rx="7" ry="3.4" fill={PROP} opacity="0.88" />
        <ellipse cx="72" cy="99" rx="7" ry="3.4" fill={PROP} opacity="0.88" />
      </g>
    );
  }
  const t = { duration: 0.5, ...LOOP };
  return (
    <g>
      <motion.path stroke={SKIN} strokeWidth="7" strokeLinecap="round" fill="none" initial={{ d: "M50 84 L44 97" }} animate={{ d: ["M50 84 L42 96", "M50 84 L58 92", "M50 84 L42 96"] }} transition={t} />
      <motion.path stroke={SKIN} strokeWidth="7" strokeLinecap="round" fill="none" initial={{ d: "M70 84 L76 97" }} animate={{ d: ["M70 84 L78 92", "M70 84 L62 96", "M70 84 L78 92"] }} transition={t} />
      <motion.ellipse rx="7" ry="3.4" fill={PROP} opacity="0.88" animate={{ cx: [42, 58, 42], cy: [98, 94, 98] }} transition={t} />
      <motion.ellipse rx="7" ry="3.4" fill={PROP} opacity="0.88" animate={{ cx: [78, 62, 78], cy: [94, 98, 94] }} transition={t} />
    </g>
  );
}

type Face = "smile" | "open" | "calm";

function Body({ face, lookDown = false, squash = false }: { face: Face; lookDown?: boolean; squash?: boolean }) {
  return (
    <motion.g
      style={{ transformOrigin: "60px 86px" }}
      animate={squash ? { scaleY: [1, 0.94, 1], scaleX: [1, 1.03, 1] } : { scaleY: [1, 1.015, 1] }}
      transition={{ duration: squash ? 1.6 : 3, ...LOOP }}
    >
      <g transform="translate(30 24) scale(0.6)">
        {/* Volumen: degradé de luz arriba-izquierda a sombra abajo-derecha + brillo */}
        <path d="M50 12 88 40 74 86H26L12 40Z" fill="url(#mascot-body)" stroke="url(#mascot-body)" strokeWidth="14" strokeLinejoin="round" />
        <path d="M26 86h48l6-18H20Z" fill="#000" opacity="0.1" />
        <path d="M22 38 48 18 54 22 30 42Z" fill="#fff" opacity="0.24" />
        {face === "open" && (
          <>
            <circle cx="24" cy="62" r="5" fill="var(--accent-fg)" opacity="0.28" />
            <circle cx="76" cy="62" r="5" fill="var(--accent-fg)" opacity="0.28" />
          </>
        )}
        {face === "calm" ? (
          <g stroke="var(--accent-fg)" strokeWidth="3.2" strokeLinecap="round" fill="none">
            <path d="M32 54q6 -6 12 0" />
            <path d="M56 54q6 -6 12 0" />
          </g>
        ) : (
          <motion.g fill="var(--accent-fg)" animate={lookDown ? { y: [0, 4, 0] } : { y: 0 }} transition={{ duration: 2.4, ...LOOP }}>
            <ellipse cx="38" cy="50" rx="4.5" ry="6" style={{ transformBox: "fill-box", transformOrigin: "center", animation: "blink 5s infinite" }} />
            <ellipse cx="62" cy="50" rx="4.5" ry="6" style={{ transformBox: "fill-box", transformOrigin: "center", animation: "blink 5s infinite" }} />
          </motion.g>
        )}
        {face === "smile" && <path d="M39 63q11 12 22 0" stroke="var(--accent-fg)" strokeWidth="3.4" strokeLinecap="round" fill="none" />}
        {face === "calm" && <path d="M43 66q7 5 14 0" stroke="var(--accent-fg)" strokeWidth="3" strokeLinecap="round" fill="none" />}
        {face === "open" && <path d="M37 62q13 24 26 0Z" fill="var(--accent-fg)" />}
      </g>
    </motion.g>
  );
}

function Floating({ children, x, delay = 0 }: { children: React.ReactNode; x: number; delay?: number }) {
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ y: [0, -22], opacity: [0, 1, 0] }}
      transition={{ duration: 2.4, delay, repeat: Infinity, ease: "easeOut" }}
      style={{ transform: `translate(${x}px, 30px)` }}
    >
      {children}
    </motion.g>
  );
}

function Scene({ activity }: { activity: Activity }) {
  switch (activity) {
    case "lift":
      return (
        <>
          <Arm frames={["M36 62 L24 64", "M36 62 L24 10", "M36 62 L24 64"]} />
          <Arm frames={["M84 62 L96 64", "M84 62 L96 10", "M84 62 L96 64"]} />
          <Legs />
          <Body face="smile" squash />
          <motion.g animate={{ y: [54, 0, 54] }} transition={{ duration: 1.6, ...LOOP }}>
            <line x1="8" y1="10" x2="112" y2="10" stroke={PROP} strokeWidth="4" strokeLinecap="round" />
            <rect x="3" y="-2" width="8" height="24" rx="2.5" fill={PROP} />
            <rect x="109" y="-2" width="8" height="24" rx="2.5" fill={PROP} />
            <rect x="12" y="2" width="5" height="16" rx="2" fill={PROP} opacity="0.7" />
            <rect x="103" y="2" width="5" height="16" rx="2" fill={PROP} opacity="0.7" />
          </motion.g>
        </>
      );
    case "drink":
      return (
        <>
          <StaticArm d="M36 62 L28 80" />
          <Arm frames={["M84 62 L98 78", "M84 62 L76 50", "M84 62 L98 78"]} duration={2.8} />
          <Legs />
          <Body face="smile" />
          <motion.g animate={{ x: [0, -22, 0], y: [0, -28, 0] }} transition={{ duration: 2.8, times: [0, 0.5, 1], ...LOOP }}>
            <path d="M91 66h14l-2 21H93Z" fill="var(--surface-solid)" stroke={PROP} strokeWidth="2.2" strokeLinejoin="round" />
            <path d="M92.2 74h11.6l-1.2 13H93.4Z" fill="var(--accent)" opacity="0.65" />
          </motion.g>
        </>
      );
    case "read":
      return (
        <>
          <StaticArm d="M36 62 L40 82" />
          <StaticArm d="M84 62 L80 82" />
          <Legs />
          <Body face="smile" lookDown />
          <path d="M60 76 38 72v22l22 4Z" fill="var(--surface-solid)" stroke={PROP} strokeWidth="2.4" strokeLinejoin="round" />
          <path d="M60 76 82 72v22l-22 4Z" fill="var(--surface-solid)" stroke={PROP} strokeWidth="2.4" strokeLinejoin="round" />
          <motion.path
            d="M60 76 82 72v22l-22 4Z"
            fill="var(--surface-solid)"
            stroke={PROP}
            strokeWidth="1.6"
            strokeLinejoin="round"
            style={{ transformOrigin: "60px 87px" }}
            animate={{ scaleX: [1, 0.05, -1, 1] }}
            transition={{ duration: 3.2, times: [0, 0.4, 0.6, 1], repeat: Infinity, ease: "easeInOut" }}
          />
        </>
      );
    case "meditate":
      return (
        <motion.g animate={{ y: [0, -5, 0] }} transition={{ duration: 4, ...LOOP }}>
          {[0, 1].map((i) => (
            <motion.circle
              key={i}
              cx="60"
              cy="58"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              initial={{ r: 34, opacity: 0.4 }}
              animate={{ r: [34, 58], opacity: [0.4, 0] }}
              transition={{ duration: 3.4, delay: i * 1.7, repeat: Infinity, ease: "easeOut" }}
            />
          ))}
          <StaticArm d="M36 64 L46 88" />
          <StaticArm d="M84 64 L74 88" />
          <Legs />
          <Body face="calm" />
        </motion.g>
      );
    case "run":
      return (
        <motion.g animate={{ y: [0, -4, 0] }} transition={{ duration: 0.5, ...LOOP }}>
          <Arm frames={["M36 62 L26 74", "M36 62 L44 76", "M36 62 L26 74"]} duration={0.5} />
          <Arm frames={["M84 62 L94 76", "M84 62 L76 74", "M84 62 L94 76"]} duration={0.5} />
          <Legs run />
          <Body face="open" />
          <motion.g animate={{ opacity: [0.2, 0.7, 0.2], x: [0, -6, 0] }} transition={{ duration: 0.5, ...LOOP }} stroke={PROP} strokeWidth="2.4" strokeLinecap="round">
            <line x1="14" y1="48" x2="24" y2="48" />
            <line x1="10" y1="60" x2="22" y2="60" />
          </motion.g>
        </motion.g>
      );
    case "sleep":
      return (
        <>
          <motion.g style={{ transformOrigin: "60px 98px" }} animate={{ rotate: [-5, -8, -5] }} transition={{ duration: 3, ...LOOP }}>
            <StaticArm d="M36 64 L30 84" />
            <StaticArm d="M84 64 L90 84" />
            <Legs />
            <Body face="calm" />
          </motion.g>
          {[0, 0.8, 1.6].map((d, i) => (
            <Floating key={d} x={86 + i * 7} delay={d}>
              <text fontSize={11 + i * 3} fontWeight="700" fill={PROP}>z</text>
            </Floating>
          ))}
        </>
      );
    case "dance":
      return (
        <motion.g style={{ transformOrigin: "60px 98px" }} animate={{ rotate: [-7, 7, -7], y: [0, -5, 0] }} transition={{ duration: 0.8, ...LOOP }}>
          <Arm frames={["M36 62 L20 34", "M36 62 L24 82", "M36 62 L20 34"]} duration={0.8} />
          <Arm frames={["M84 62 L96 82", "M84 62 L100 34", "M84 62 L96 82"]} duration={0.8} />
          <Legs />
          <Body face="open" />
          <Floating x={4}>
            <path d="M0 0v-12l7-2v12" stroke={PROP} strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <circle cx="-2" cy="1" r="3" fill={PROP} />
          </Floating>
          <Floating x={102} delay={1.1}>
            <path d="M0 0v-12l7-2v12" stroke={PROP} strokeWidth="2.4" fill="none" strokeLinecap="round" />
            <circle cx="-2" cy="1" r="3" fill={PROP} />
          </Floating>
        </motion.g>
      );
    case "celebrate":
      return (
        <>
          <Arm frames={["M36 60 L20 32", "M36 60 L14 44", "M36 60 L20 32"]} duration={0.8} />
          <Arm frames={["M84 60 L100 32", "M84 60 L106 44", "M84 60 L100 32"]} duration={0.8} delay={0.15} />
          <Legs />
          <Body face="open" />
        </>
      );
    case "wave":
      return (
        <>
          <StaticArm d="M36 62 L27 82" />
          <Arm frames={["M84 62 L100 36", "M84 62 L108 46", "M84 62 L100 36"]} duration={0.6} />
          <Legs />
          <Body face="smile" />
        </>
      );
    default:
      return (
        <>
          <Arm frames={["M36 62 L26 82", "M36 62 L28 85", "M36 62 L26 82"]} duration={3.6} />
          <Arm frames={["M84 62 L94 82", "M84 62 L92 85", "M84 62 L94 82"]} duration={3.6} delay={0.4} />
          <Legs />
          <Body face="smile" />
        </>
      );
  }
}

const LABEL: Record<Activity, string> = {
  idle: "El personaje te acompaña",
  wave: "El personaje te saluda",
  lift: "El personaje levanta pesas",
  drink: "El personaje toma agua",
  read: "El personaje lee",
  meditate: "El personaje medita",
  run: "El personaje corre",
  sleep: "El personaje duerme",
  dance: "El personaje baila",
  celebrate: "El personaje festeja",
};

/**
 * Personaje con volumen: se inclina siguiendo el dedo o el mouse, reacciona al toque y hace
 * actividades. Por defecto respira, parpadea y saluda de vez en cuando; al tocar un hábito hace
 * esa actividad durante 10 s (ver `lib/mascot.ts`).
 */
export function MascotFigure({ activity, size = 104, interactive = true }: { activity: Activity; size?: number; interactive?: boolean }) {
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-18, 18]), { stiffness: 180, damping: 16 });
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [14, -14]), { stiffness: 180, damping: 16 });
  const [idleWave, setIdleWave] = useState(false);

  // Estado por defecto vivo: de vez en cuando saluda un par de segundos.
  useEffect(() => {
    if (activity !== "idle") return;
    let t: ReturnType<typeof setTimeout>;
    const schedule = (wave: boolean) => {
      t = setTimeout(() => {
        setIdleWave(!wave);
        schedule(!wave);
      }, wave ? 2200 : 7500);
    };
    schedule(false);
    return () => {
      clearTimeout(t);
      setIdleWave(false);
    };
  }, [activity]);

  const shown: Activity = activity === "idle" && idleWave ? "wave" : activity;

  return (
    <div className="[perspective:600px]">
      <motion.div
        role="img"
        aria-label={LABEL[shown]}
        className="shrink-0 touch-pan-y"
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
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
        onClick={() => interactive && playActivity("dance", 3500)}
        whileTap={interactive ? { scale: 0.94 } : undefined}
        animate={
          shown === "celebrate"
            ? { y: [0, -14, 0, -8, 0] }
            : shown === "idle"
              ? { y: [0, -3, 0] }
              : { y: 0 }
        }
        transition={
          shown === "celebrate"
            ? { duration: 1.4, repeat: Infinity, repeatDelay: 1, ease: "easeInOut" }
            : { duration: 3.2, ...LOOP }
        }
      >
        <svg width={size} height={size * 0.93} viewBox="0 0 120 112" overflow="visible">
          <defs>
            <linearGradient id="mascot-body" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" style={{ stopColor: "color-mix(in srgb, var(--accent) 72%, white)" }} />
              <stop offset="55%" style={{ stopColor: "var(--accent)" }} />
              <stop offset="100%" style={{ stopColor: "color-mix(in srgb, var(--accent) 72%, black)" }} />
            </linearGradient>
          </defs>
          <motion.ellipse
            cx="60"
            cy="100"
            rx="28"
            ry="4"
            fill="var(--fg)"
            opacity="0.1"
            animate={shown === "celebrate" ? { rx: [28, 20, 28] } : { rx: 28 }}
            transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 1, ease: "easeInOut" }}
          />
          <AnimatePresence mode="wait" initial={false}>
            <motion.g key={shown} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
              <Scene activity={shown} />
            </motion.g>
          </AnimatePresence>
        </svg>
      </motion.div>
    </div>
  );
}

export function Mascot({ message }: { message: string }) {
  // Lo último que se tocó manda durante 10 s; después vuelve al estado por defecto.
  const override = useActivityOverride();
  const activity: Activity = override ?? "idle";

  return (
    <div className="mb-5 flex items-end gap-1">
      <MascotFigure activity={activity} />
      <div className="relative min-w-0 flex-1 pb-3">
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
