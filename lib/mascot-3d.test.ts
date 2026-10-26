import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OPTIONAL_CLIPS, REQUIRED_MORPHS, REQUIRED_NODES } from "./mascot-3d";

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

  it("pesa menos de 2 MB y es glTF 2.0 sin extensiones obligatorias ni texturas", () => {
    expect(statSync(PATH).size).toBeLessThan(2 * 1024 * 1024);
    expect(gltf.asset.version).toBe("2.0");
    expect(gltf.extensionsRequired ?? []).toEqual([]);
    expect(gltf.images ?? []).toHaveLength(0);
  });

  it("tiene todas las piezas con los nombres exactos", () => {
    for (const name of REQUIRED_NODES) expect(nodeNames.has(name), `falta el nodo ${name}`).toBe(true);
  });

  it("los clips del archivo son opcionales (el personaje se anima por código), pero siguen estando", () => {
    const clips = new Set((gltf.animations ?? []).map((a) => a.name));
    for (const c of OPTIONAL_CLIPS) expect(clips.has(c), `falta el clip ${c}`).toBe(true);
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
