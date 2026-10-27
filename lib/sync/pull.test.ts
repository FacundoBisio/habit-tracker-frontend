import { describe, expect, it, vi } from "vitest";
import { applyPull, sameRow, type PullTable } from "./pull";

type Row = { id: string; [k: string]: unknown };

function fakeTable(rows: Row[]) {
  const data = new Map(rows.map((r) => [r.id, r]));
  const table = {
    toArray: async () => [...data.values()],
    bulkPut: vi.fn(async (list: Row[]) => list.forEach((r) => data.set(r.id, r))),
    bulkDelete: vi.fn(async (ids: string[]) => ids.forEach((id) => data.delete(id))),
  } satisfies PullTable<Row>;
  return { table, data };
}

const habit = (id: string, extra: Partial<Row> = {}): Row => ({ id, name: "Agua", emoji: "droplets", color: "teal", kind: "quantity", unit: "vasos", defaultAmount: 1, schedule: { type: "days_of_week", days: [1, 3] }, archived: false, sortOrder: 0, aliases: ["vaso"], ...extra });

describe("pull que solo escribe lo que cambió", () => {
  it("con los mismos datos que el servidor no escribe nada", async () => {
    const local = [habit("a"), habit("b", { unit: undefined })];
    // Lo del servidor llega por JSON: otro orden de claves y sin los campos undefined
    const server = JSON.parse(JSON.stringify([{ ...habit("b"), unit: undefined }, habit("a")].map((h) => Object.fromEntries(Object.entries(h).reverse()))));
    const { table } = fakeTable(local);
    await applyPull(table, server, new Set());
    expect(table.bulkPut).not.toHaveBeenCalled();
    expect(table.bulkDelete).not.toHaveBeenCalled();
  });

  it("escribe solo lo nuevo o distinto y borra lo que ya no está", async () => {
    const { table, data } = fakeTable([habit("a"), habit("b"), habit("gone")]);
    await applyPull(table, [habit("a"), habit("b", { name: "Agua fría" }), habit("c")], new Set());
    expect(table.bulkPut).toHaveBeenCalledTimes(1);
    expect(table.bulkPut.mock.calls[0][0].map((r: Row) => r.id)).toEqual(["b", "c"]);
    expect(table.bulkDelete).toHaveBeenCalledWith(["gone"]);
    expect(data.get("b")?.name).toBe("Agua fría");
  });

  it("lo pendiente local no se pisa ni se borra", async () => {
    const { table } = fakeTable([habit("a"), habit("mine")]);
    await applyPull(table, [habit("a", { name: "Otro" })], new Set(["a", "mine"]));
    expect(table.bulkPut).not.toHaveBeenCalled();
    expect(table.bulkDelete).not.toHaveBeenCalled();
  });

  it("comparación estable", () => {
    expect(sameRow({ a: 1, b: { x: [1, 2] } }, { b: { x: [1, 2] }, a: 1 })).toBe(true);
    expect(sameRow({ a: 1, u: undefined }, { a: 1 })).toBe(true);
    expect(sameRow({ a: [1, 2] }, { a: [2, 1] })).toBe(false);
    expect(sameRow({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(sameRow({ a: null }, { a: undefined })).toBe(false);
  });
});
