"use client";

import { motion } from "framer-motion";
import { useBursts, type Burst, type Particle } from "@/lib/confetti";

function Shape({ kind, color, size }: { kind: Particle["shape"]; color: string; size: number }) {
  if (kind === "circle") return <span className="block rounded-full" style={{ width: size, height: size, background: color }} />;
  if (kind === "square") return <span className="block rounded-[2px]" style={{ width: size, height: size, background: color }} />;
  if (kind === "triangle") {
    return (
      <svg width={size * 1.3} height={size * 1.3} viewBox="0 0 10 10">
        <path d="M5 1 9 9H1z" fill={color} />
      </svg>
    );
  }
  return (
    <svg width={size * 1.4} height={size * 1.4} viewBox="0 0 10 10">
      <path d="M5 0.5 6.3 3.6 9.6 3.9 7.1 6.1 7.9 9.4 5 7.7 2.1 9.4 2.9 6.1 0.4 3.9 3.7 3.6z" fill={color} />
    </svg>
  );
}

function BurstView({ burst }: { burst: Burst }) {
  return (
    <>
      {burst.particles.map((p, i) => (
        <motion.span
          key={i}
          className="absolute"
          style={{ left: burst.x, top: burst.y }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
          animate={{ x: p.dx, y: [0, p.dy, p.dy + 90], opacity: [1, 1, 0], scale: 1, rotate: p.rot }}
          transition={{ duration: 1.2, delay: p.delay, ease: "easeOut", times: [0, 0.45, 1] }}
        >
          <Shape kind={p.shape} color={p.color} size={p.size} />
        </motion.span>
      ))}
    </>
  );
}

export function ConfettiLayer() {
  const bursts = useBursts();
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      {bursts.map((b) => (
        <BurstView key={b.id} burst={b} />
      ))}
    </div>
  );
}
