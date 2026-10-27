"use client";

import { toast } from "@/lib/notify";

/**
 * Registra el service worker con la versión del build y, cuando hay uno nuevo esperando, ofrece
 * actualizar. No se activa solo: así no cambia el código debajo de una pantalla abierta.
 */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  let updating = false;

  const offer = (worker: ServiceWorker) =>
    toast("Hay una versión nueva", {
      duration: 60_000,
      action: {
        label: "Actualizar",
        onClick: () => {
          // Si otra pestaña ya lo activó, alcanza con recargar.
          if (worker.state === "activated") return window.location.reload();
          updating = true;
          worker.postMessage({ type: "SKIP_WAITING" });
        },
      },
    });

  // Solo se recarga si el cambio lo pidió el usuario (la primera instalación también cambia el controlador).
  sw.addEventListener("controllerchange", () => {
    if (!updating) return;
    updating = false;
    window.location.reload();
  });

  sw.register(`/sw.js?v=${encodeURIComponent(process.env.NEXT_PUBLIC_BUILD_ID ?? "dev")}`)
    .then((reg) => {
      if (reg.waiting && sw.controller) offer(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && sw.controller) offer(worker);
        });
      });
    })
    .catch(() => {});
}
