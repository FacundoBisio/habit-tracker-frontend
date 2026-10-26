"use client";

import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const ORDER = ["/", "/semana", "/objetivos", "/stats", "/ajustes"];
const indexOf = (path: string) => {
  const i = ORDER.findIndex((p) => (p === "/" ? path === "/" : path.startsWith(p)));
  return i === -1 ? 0 : i;
};

// Pestaña anterior (a nivel de módulo: el template se remonta en cada navegación).
let previous: number | null = null;

/**
 * Transición entre pantallas, coordinada con la barra inferior: mismo tiempo y misma curva, y el
 * contenido entra desde el lado hacia el que se mueve la píldora. Un solo movimiento, sin importar
 * cuántas pestañas se salten. En la primera carga no anima (el contenido ya viene en el HTML).
 *
 * Solo opacidad y desplazamiento: `filter`/`transform` persistentes crearían un bloque contenedor
 * para los `position: fixed` (los popups se posicionarían respecto a la columna, no a la pantalla).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const current = indexOf(usePathname());
  // `previous` se lee una sola vez, en el primer render de esta instancia.
  const [from] = useState(previous);
  useEffect(() => {
    previous = current;
  }, [current]);

  const dir = from === null ? 0 : Math.sign(current - from);
  return (
    <motion.div
      initial={from === null ? false : { opacity: 0, x: dir * 28 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
    >
      {children}
    </motion.div>
  );
}
