"use client";

import { LazyMotion } from "framer-motion";

// Las capacidades de animación (incluido `layout`, que usan la barra inferior y la tira de días) se descargan aparte,
// después del primer render: no entran en el JavaScript inicial.
const loadFeatures = () => import("@/lib/motion-features").then((m) => m.default);

/** Todos los componentes animan con `m.*`; `strict` avisa si alguien usa `motion.*` (que traería todo de entrada). */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      {children}
    </LazyMotion>
  );
}
