import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { REQUIRED_MORPHS, REQUIRED_NODES } from "./mascot-3d";

const PATH = "public/models/mascot.glb";

interface Gltf {
  asset: { version: string };
  extensionsRequired?: string[];
  nodes: { name?: string }[];
  meshes: { name?: string; extras?: { targetNames?: string[] }; primitives: { indices?: number; attributes: { POSITION: number }; targets?: unknown[] }[] }[];
  accessors: { count: number; max?: number[] }[];
  animations?: { name: string; samplers: { input: number }[] }[];
  images?: unknown[];
}

function readGlb(): Gltf {
  const buf = readFileSync(PATH);
  expect(buf.toString("utf8", 0, 4)).toBe("glTF");
  const len = buf.readUInt32LE(12);
  return JSON.parse(buf.toString("utf8", 20, 20 + len)) as Gltf;
}

describe("contrato del modelo 3D (public/models/mascot.glb)", () => {
  const gltf = readGlb();
  const nodeNames = new Set(gltf.nodes.map((n) => n.name));

  it("pesa menos de 600 KB (sin comprimir) y es glTF 2.0 sin extensiones obligatorias ni texturas", () => {
    expect(statSync(PATH).size).toBeLessThan(600 * 1024);
    expect(gltf.asset.version).toBe("2.0");
    expect(gltf.extensionsRequired ?? []).toEqual([]);
    expect(gltf.images ?? []).toHaveLength(0);
  });

  it("tiene todas las piezas con los nombres exactos", () => {
    for (const name of REQUIRED_NODES) expect(nodeNames.has(name), `falta el nodo ${name}`).toBe(true);
  });

  it("no trae clips: el personaje se anima por código (los clips originales se sacaron para bajar el peso)", () => {
    expect(gltf.animations ?? []).toHaveLength(0);
  });

  it("ningún triángulo apunta a vértices que no existen (la mancuerna original traía índices rotos; ahora son triángulos degenerados)", () => {
    const buf = readFileSync(PATH);
    const jsonLen = buf.readUInt32LE(12);
    const binStart = 20 + jsonLen + 8;
    const views = (gltf as unknown as { bufferViews: { byteOffset?: number }[] }).bufferViews;
    const accs = gltf.accessors as unknown as { bufferView: number; byteOffset?: number; componentType: number; count: number }[];
    for (const m of gltf.meshes) {
      for (const p of m.primitives) {
        if (p.indices === undefined) continue;
        const a = accs[p.indices];
        const n = gltf.accessors[p.attributes.POSITION].count;
        const off = binStart + (views[a.bufferView].byteOffset ?? 0) + (a.byteOffset ?? 0);
        const size = a.componentType === 5125 ? 4 : 2;
        for (let i = 0; i < a.count; i++) {
          const v = size === 4 ? buf.readUInt32LE(off + i * 4) : buf.readUInt16LE(off + i * 2);
          expect(v, `índice fuera de rango en ${m.name}`).toBeLessThan(n);
        }
      }
    }
  });

  it("el cuerpo tiene todos los morph targets pedidos", () => {
    const body = gltf.meshes.find((m) => m.name === "Body")!;
    const names = body.extras?.targetNames ?? [];
    for (const m of REQUIRED_MORPHS) expect(names, `falta el morph ${m}`).toContain(m);
  });

  it("no supera 10.500 triángulos", () => {
    let tris = 0;
    for (const m of gltf.meshes) {
      for (const p of m.primitives) {
        const count = p.indices !== undefined ? gltf.accessors[p.indices].count : gltf.accessors[p.attributes.POSITION].count;
        tris += Math.floor(count / 3);
      }
    }
    expect(tris).toBeLessThan(10_500);
  });
});
