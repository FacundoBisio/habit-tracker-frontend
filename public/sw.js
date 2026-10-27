/* Service worker mínimo: la app es offline-first (datos en IndexedDB);
   esto cachea el shell para abrirla sin señal.

   - La versión viene del build: AppShell lo registra como `/sw.js?v=<build>`, así cada deploy instala
     un SW nuevo con cachés nuevas y al activarse borra las de versiones anteriores.
   - Dos cachés: el shell (las pantallas, precacheadas) y una de runtime con tope de entradas para
     los estáticos (chunks con hash, el modelo 3D cuando de verdad se usa, íconos).
   - No hay skipWaiting a ciegas: la app muestra "Hay una versión nueva" y, si el usuario toca
     Actualizar, manda SKIP_WAITING y recarga cuando cambia el controlador. */
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const SHELL_CACHE = `habitos-shell-${VERSION}`;
const RUNTIME_CACHE = `habitos-runtime-${VERSION}`;
const RUNTIME_MAX = 60;
const SHELL = ["/", "/semana", "/objetivos", "/stats", "/ajustes", "/manifest.webmanifest"];
/** Caché del SW anterior (activaba con skipWaiting): si está, se migra de una sin esperar. */
const LEGACY_CACHE = "habitos-v2";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(SHELL);
      // Los clientes con el SW viejo no saben mostrar el aviso de actualización: se pasa una sola vez.
      if (await caches.has(LEGACY_CACHE)) await self.skipWaiting();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = [SHELL_CACHE, RUNTIME_CACHE];
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

/** Guarda en la caché de runtime y borra las entradas más viejas si se pasa del tope. */
async function putRuntime(req, res) {
  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(req, res);
  const keys = await cache.keys(); // en orden de inserción: las primeras son las más viejas
  for (let i = 0; i < keys.length - RUNTIME_MAX; i++) await cache.delete(keys[i]);
}

const cacheable = (res) => res && res.ok && res.type === "basic";

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (url.pathname === "/sw.js") return;

  // Navegaciones: red primero, con caché de respaldo.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (cacheable(res)) {
            const copy = res.clone();
            if (SHELL.includes(url.pathname)) caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            else putRuntime(req, copy).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/")).then((r) => r || Response.error())),
    );
    return;
  }

  // Chunks con hash: nunca cambian, así que caché primero sin volver a pedirlos.
  const immutable = url.pathname.startsWith("/_next/static/");

  // Resto de los estáticos: caché primero, se refresca en segundo plano.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached && immutable) return cached;
      const network = fetch(req)
        .then((res) => {
          if (cacheable(res)) {
            const copy = res.clone();
            putRuntime(req, copy).catch(() => {});
          }
          return res;
        })
        .catch(() => cached || Response.error());
      return cached || network;
    }),
  );
});
