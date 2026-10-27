import { describe, expect, it } from "vitest";
import { NAME_MAX, nameError, nameLength, nameSchema, normalizeName } from "./name";

describe("nombre del usuario", () => {
  it("recorta y colapsa espacios", () => {
    expect(normalizeName("   Facu    Bisio  ")).toBe("Facu Bisio");
  });

  it("quita caracteres invisibles y de control", () => {
    expect(normalizeName("Fa\u200bcu\u0007\ufeff")).toBe("Fa cu");
    expect(normalizeName("\u200b\u200b")).toBe("");
  });

  it("normaliza a NFC (la tilde combinada queda como un solo carácter)", () => {
    expect(normalizeName("Jose\u0301")).toBe("José");
  });

  it("los emojis compuestos cuentan como un carácter", () => {
    expect(nameLength("Ana 👩‍💻")).toBe(5);
  });

  it("acepta 1 a 30 caracteres y rechaza vacío y 31", () => {
    expect(nameError("")).not.toBeNull();
    expect(nameError("A")).toBeNull();
    expect(nameError("a".repeat(NAME_MAX))).toBeNull();
    expect(nameError("a".repeat(NAME_MAX + 1))).not.toBeNull();
  });

  it("el esquema normaliza y valida", () => {
    expect(nameSchema.parse("  Facu  ")).toBe("Facu");
    expect(nameSchema.safeParse("   ").success).toBe(false);
    expect(nameSchema.safeParse("a".repeat(31)).success).toBe(false);
  });
});
