// Construye en una carpeta aparte (.next-e2e) y sirve en el puerto 3100 para los E2E y Lighthouse.
import { spawn, spawnSync } from "node:child_process";

const env = { ...process.env, NEXT_DIST_DIR: ".next-e2e" };
const port = process.env.E2E_PORT ?? "3100";
const shell = process.platform === "win32";

if (!process.env.E2E_SKIP_BUILD) {
  const build = spawnSync("npx", ["next", "build"], { env, stdio: "inherit", shell });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

const server = spawn("npx", ["next", "start", "-p", port], { env, stdio: "inherit", shell });
const stop = () => server.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
server.on("exit", (code) => process.exit(code ?? 0));
