"use client";

import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Award, CalendarCheck, CheckCheck, Crown, Flag, Flame, Lock, type LucideIcon, Medal, Sparkles, Trophy } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/lib/cn";
import { GROUP_LABEL, type Achievement, type AchievementGroup, type AchievementIcon } from "@/lib/domain/achievements";
import { useAchievements } from "@/lib/store/achievements";

const ICONS: Record<AchievementIcon, LucideIcon> = {
  flame: Flame,
  "calendar-check": CalendarCheck,
  "check-check": CheckCheck,
  sparkles: Sparkles,
  trophy: Trophy,
  flag: Flag,
  crown: Crown,
  medal: Medal,
};

/**
 * Insignia con inclinación 3D: sigue el dedo o el mouse (perspectiva + capas a distinta
 * profundidad) y vuelve suave a su lugar. Con "menos movimiento" queda plana (CSS global).
 */
function Badge({ a }: { a: Achievement }) {
  const Icon = ICONS[a.icon];
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-16, 16]), { stiffness: 220, damping: 18 });
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [16, -16]), { stiffness: 220, damping: 18 });
  const shine = useTransform(px, [-0.5, 0.5], ["0%", "100%"]);

  const move = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    px.set((e.clientX - r.left) / r.width - 0.5);
    py.set((e.clientY - r.top) / r.height - 0.5);
  };
  const leave = () => {
    px.set(0);
    py.set(0);
  };

  return (
    <li className="[perspective:700px]">
      <motion.div
        ref={ref}
        onPointerMove={move}
        onPointerLeave={leave}
        onPointerCancel={leave}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        aria-label={`${a.title}. ${a.description}. ${a.unlocked ? "Desbloqueado" : `Avance ${a.value} de ${a.target}`}`}
        role="group"
        className={cn(
          "card relative flex h-full flex-col items-center gap-2 overflow-hidden rounded-2xl px-2 py-3 text-center",
          !a.unlocked && "opacity-80",
        )}
      >
        {a.unlocked && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: "linear-gradient(115deg, transparent 30%, color-mix(in srgb, var(--accent) 22%, transparent) 50%, transparent 70%)",
              backgroundPositionX: shine,
              backgroundSize: "250% 100%",
            }}
          />
        )}
        <span
          style={{ transform: "translateZ(30px)" }}
          className={cn(
            "relative grid size-12 place-items-center rounded-2xl",
            a.unlocked ? "chip" : "bg-surface-2 text-muted",
          )}
        >
          <Icon className="size-6" strokeWidth={1.9} aria-hidden />
          {!a.unlocked && (
            <span className="absolute -right-1 -bottom-1 grid size-5 place-items-center rounded-full bg-surface-solid shadow">
              <Lock className="size-3 text-muted" aria-hidden />
            </span>
          )}
        </span>
        <span style={{ transform: "translateZ(14px)" }} className="text-[12px] leading-tight font-semibold">
          {a.title}
        </span>
        {a.unlocked ? (
          <span style={{ transform: "translateZ(8px)" }} className="text-[10.5px] font-medium text-accent">
            Desbloqueado
          </span>
        ) : (
          <span style={{ transform: "translateZ(8px)" }} className="w-full">
            <span className="block h-1 overflow-hidden rounded-full bg-surface-2">
              <span className="block h-full rounded-full bg-accent/70" style={{ width: `${(a.value / a.target) * 100}%` }} />
            </span>
            <span className="mt-1 block text-[10.5px] text-muted tabular-nums">
              {a.value}/{a.target}
            </span>
          </span>
        )}
      </motion.div>
    </li>
  );
}

const GROUP_ORDER: AchievementGroup[] = ["rachas", "constancia", "registros", "dias", "objetivos"];

export function Achievements() {
  const { list, ready } = useAchievements();
  if (!ready) return <div className="h-24 animate-pulse rounded-2xl bg-surface-2" aria-hidden />;

  const unlocked = list.filter((a) => a.unlocked).length;
  return (
    <div className="space-y-5">
      <p className="flex items-center gap-2 text-sm text-muted">
        <Award className="size-4" aria-hidden />
        <span>
          <span className="font-semibold text-fg tabular-nums">{unlocked}</span> de {list.length} desbloqueados
        </span>
      </p>
      {GROUP_ORDER.map((g) => (
        <section key={g}>
          <h3 className="font-display mb-2 text-sm font-semibold">{GROUP_LABEL[g]}</h3>
          <ul className="grid grid-cols-3 gap-2.5">
            {list
              .filter((a) => a.group === g)
              .map((a) => (
                <Badge key={a.id} a={a} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
