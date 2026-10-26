"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, CalendarDays, CircleCheck, Settings, Target } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/", label: "Hoy", icon: CircleCheck },
  { href: "/semana", label: "Semana", icon: CalendarDays },
  { href: "/objetivos", label: "Objetivos", icon: Target },
  { href: "/stats", label: "Stats", icon: BarChart3 },
  { href: "/ajustes", label: "Ajustes", icon: Settings },
];

// Una sola curva suave para todo el movimiento de la barra (píldora, ancho y etiqueta).
const SMOOTH = { duration: 0.6, ease: [0.32, 0.72, 0, 1] as const };

/**
 * Barra flotante que sigue el tema (clara en modo claro, oscura en modo oscuro).
 * La pestaña activa se expande en una píldora con su nombre; el cambio entre secciones es continuo.
 */
export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="Navegación principal"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
    >
      <ul className="pointer-events-auto mx-auto flex max-w-md items-center justify-between rounded-full border border-[var(--nav-border)] bg-[var(--nav-bg)] p-1.5 shadow-[var(--nav-shadow)] backdrop-blur-xl transition-colors duration-500">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <motion.li key={href} layout transition={SMOOTH}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={label}
                className={cn(
                  "relative flex h-12 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors duration-500",
                  active ? "px-4 text-accent-fg" : "w-12 text-[var(--nav-fg)] hover:text-fg",
                )}
              >
                {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-accent" transition={SMOOTH} />}
                <motion.span layout="position" transition={SMOOTH} className="relative">
                  <Icon className="size-[21px]" strokeWidth={active ? 2.3 : 1.8} />
                </motion.span>
                <AnimatePresence initial={false}>
                  {active && (
                    <motion.span
                      key="label"
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: "auto", transition: { ...SMOOTH, opacity: { duration: 0.4, delay: 0.15 } } }}
                      exit={{ opacity: 0, width: 0, transition: { ...SMOOTH, opacity: { duration: 0.2 } } }}
                      className="relative overflow-hidden whitespace-nowrap"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            </motion.li>
          );
        })}
      </ul>
    </nav>
  );
}
