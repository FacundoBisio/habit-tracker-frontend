import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySupabaseJwt } from "./jwt";

const SECRET = "super-secreto-de-prueba-con-32-caracteres!!";
const USER = "8f2a1c3e-5b6d-4e7f-9a0b-1c2d3e4f5a6b";
const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
function sign(payload: object, secret = SECRET, header: object = { alg: "HS256", typ: "JWT" }) {
  const hp = `${enc(header)}.${enc(payload)}`;
  return `${hp}.${createHmac("sha256", secret).update(hp).digest("base64url")}`;
}
const NOW = 1_800_000_000;
const ok = { sub: USER, exp: NOW + 600, role: "authenticated", aud: "authenticated" };

describe("verifySupabaseJwt", () => {
  it("acepta un token válido", () => {
    expect(verifySupabaseJwt(sign(ok), SECRET, NOW)).toBe(USER);
  });

  it("rechaza firma con otro secreto, vencido, rol anon y alg none", () => {
    expect(verifySupabaseJwt(sign(ok, "otro-secreto"), SECRET, NOW)).toBeNull();
    expect(verifySupabaseJwt(sign({ ...ok, exp: NOW - 1 }), SECRET, NOW)).toBeNull();
    expect(verifySupabaseJwt(sign({ ...ok, role: "anon" }), SECRET, NOW)).toBeNull();
    expect(verifySupabaseJwt(sign(ok, SECRET, { alg: "none" }), SECRET, NOW)).toBeNull();
  });

  it("rechaza un payload alterado y basura", () => {
    const [h, , s] = sign(ok).split(".");
    expect(verifySupabaseJwt(`${h}.${enc({ ...ok, sub: "11111111-1111-4111-8111-111111111111" })}.${s}`, SECRET, NOW)).toBeNull();
    expect(verifySupabaseJwt("no.es.jwt", SECRET, NOW)).toBeNull();
    expect(verifySupabaseJwt(sign(ok), "", NOW)).toBeNull();
  });
});
