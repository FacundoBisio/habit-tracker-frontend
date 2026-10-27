import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

// Versión del build para el service worker (`/sw.js?v=...`): el commit en Vercel, o la hora del build en local.
// Se fija en process.env para que todos los workers del build vean el mismo valor.
process.env.NEXT_PUBLIC_BUILD_ID ??= process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || Date.now().toString(36);

const nextConfig: NextConfig = {
  // Permite que los E2E construyan en otra carpeta sin pisar un `next dev` en marcha.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BUILD_ID: process.env.NEXT_PUBLIC_BUILD_ID },
  // Next genera AGENTS.md al detectar un agente de IA en `next dev`; no queremos ese archivo en el repo.
  agentRules: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
