import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // Sin aislar cada archivo: reusa los workers (los tests no dependen de estado global entre archivos).
  test: { include: ["lib/**/*.test.ts", "app/**/*.test.ts"], isolate: false },
});
