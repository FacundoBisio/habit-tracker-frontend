"use client";

import { AnimatePresence, m } from "framer-motion";
import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";

/** Popup centrado (modal). Se monta en <body> para no depender de los estilos de ningún ancestro. */
export function Sheet({
  open,
  onClose,
  title,
  icon,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    document.documentElement.dataset.modal = "1"; // pausa el aura de fondo mientras está abierto
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      delete document.documentElement.dataset.modal;
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <m.div
            className="absolute inset-0 bg-black/50 backdrop-blur-[4px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <m.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="relative max-h-full w-full max-w-md overflow-y-auto rounded-[1.75rem] border border-border bg-surface-solid p-5 shadow-[0_30px_80px_-20px_rgb(0_0_0/0.5)]"
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.16 } }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="font-display flex min-w-0 items-center gap-3 text-xl font-semibold tracking-tight">
                {icon}
                <span className="truncate">{title}</span>
              </h2>
              <button
                onClick={onClose}
                aria-label="Cerrar"
                className="grid size-11 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2"
              >
                <X className="size-5" />
              </button>
            </div>
            {children}
          </m.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export const inputCls =
  "h-12 w-full rounded-xl border border-border bg-surface-2 px-3.5 outline-none transition focus:border-fg/40 focus:bg-surface-solid";
export const labelCls = "mb-1.5 block text-sm font-medium text-muted";
export const primaryBtn =
  "inline-flex h-12 w-full items-center justify-center rounded-2xl bg-accent px-4 font-semibold text-accent-fg shadow-[0_10px_24px_-10px_var(--accent)] transition active:scale-[0.98] disabled:opacity-35 disabled:shadow-none";
export const ghostBtn =
  "inline-flex h-11 items-center justify-center rounded-xl border border-border bg-surface-2 px-4 text-sm font-medium transition hover:bg-surface-2/60 active:scale-[0.98]";
