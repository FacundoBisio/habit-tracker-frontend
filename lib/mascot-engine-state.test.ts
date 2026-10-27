import { beforeAll, describe, expect, it, vi } from "vitest";

const loadEngine = vi.fn(async () => {});
vi.mock("./mascot-engine", () => ({ loadEngine }));

beforeAll(() => {
  // Navegador mínimo: 3D elegido, con WebGL 2 y sin "menos movimiento"
  Object.assign(globalThis, {
    window: { matchMedia: () => ({ matches: false }) },
    document: { createElement: () => ({ getContext: () => ({}) }) },
    localStorage: { getItem: () => null, setItem: () => {} },
  });
});

describe("motor del personaje: estado y precarga", () => {
  it("preloadMascot es idempotente: dos llamadas, una sola carga del motor", async () => {
    const { preloadMascot, getMascotStatus } = await import("./mascot-engine-state");
    expect(getMascotStatus()).toBe("idle");
    const a = preloadMascot();
    const b = preloadMascot();
    expect(a).toBe(b);
    expect(getMascotStatus()).toBe("loading");
    await a;
    expect(loadEngine).toHaveBeenCalledTimes(1);
  });

  it("los contadores de diagnóstico se crean una sola vez", async () => {
    const { mascotStats } = await import("./mascot-engine-state");
    mascotStats().renderers++;
    expect(mascotStats().renderers).toBe(1);
  });
});
