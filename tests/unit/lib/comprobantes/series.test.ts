import { beforeEach, describe, expect, it, vi } from "vitest";

const { mock } = await vi.hoisted(async () => {
  const { createMockSupabase } = await import("@/tests/__mocks__/supabase");
  return { mock: createMockSupabase() };
});

vi.mock("@/lib/supabase/client", () => ({ supabase: mock.client }));

import {
  advanceSeriesNumber,
  createSeries,
  formatSeriesCorrelative,
  listSeries,
  setDefaultSeries,
  softDeleteSeries,
  suggestVoucherNumber,
} from "@/lib/comprobantes/series";

const seriesRow = (overrides: Record<string, unknown> = {}) => ({
  id: "s-1",
  owner_id: "o-1",
  voucher_type: "FACTURA",
  code: "F001",
  last_number: 5,
  is_default: true,
  created_at: "2026-10-26T00:00:00Z",
  updated_at: "2026-10-26T00:00:00Z",
  deleted_at: null,
  ...overrides,
});

describe("suggestVoucherNumber", () => {
  it("sugiere el siguiente correlativo con 6 dígitos y código en mayúsculas", () => {
    expect(suggestVoucherNumber({ code: "f001", lastNumber: 5 })).toBe(
      "F001-000006"
    );
    expect(suggestVoucherNumber({ code: "B001", lastNumber: 0 })).toBe(
      "B001-000001"
    );
    expect(suggestVoucherNumber({ code: "NV01", lastNumber: 125 })).toBe(
      "NV01-000126"
    );
  });
});

describe("formatSeriesCorrelative", () => {
  it("rellena a 6 dígitos para la tabla de configuración", () => {
    expect(formatSeriesCorrelative(0)).toBe("000000");
    expect(formatSeriesCorrelative(125)).toBe("000125");
  });
});

describe("listSeries", () => {
  beforeEach(() => {
    mock.reset();
  });

  it("filtra las no borradas y mapea a camelCase", async () => {
    mock.setTable("voucher_series", { data: [seriesRow()], error: null });

    const result = await listSeries();

    expect(result).toEqual([
      {
        id: "s-1",
        voucherType: "FACTURA",
        code: "F001",
        lastNumber: 5,
        isDefault: true,
        deletedAt: null,
      },
    ]);
    expect(mock.filterCalls).toContainEqual({
      table: "voucher_series",
      method: "is",
      args: ["deleted_at", null],
    });
  });

  it("traduce el duplicado de código a un mensaje claro", async () => {
    mock.setTable("voucher_series", {
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });

    await expect(listSeries()).rejects.toThrow(
      "Ya existe una serie con ese código para ese tipo."
    );
  });
});

describe("createSeries", () => {
  beforeEach(() => {
    mock.reset();
  });

  it("inserta el código en mayúsculas y el correlativo en 0", async () => {
    mock.queueTable("voucher_series", {
      data: [seriesRow({ code: "F001", last_number: 0, is_default: false })],
      error: null,
    });

    const created = await createSeries({
      voucherType: "FACTURA",
      code: " f001 ",
      isDefault: false,
    });

    expect(mock.insertCalls[0]).toEqual({
      table: "voucher_series",
      payload: {
        voucher_type: "FACTURA",
        code: "F001",
        last_number: 0,
        is_default: false,
      },
    });
    expect(created.isDefault).toBe(false);
  });

  it("deja la serie como predeterminada después del insert", async () => {
    mock.queueTable("voucher_series", {
      data: [seriesRow({ code: "F001", is_default: false })],
      error: null,
    });
    mock.queueTable("voucher_series", { data: [], error: null });
    mock.queueTable("voucher_series", { data: [], error: null });

    const created = await createSeries({
      voucherType: "FACTURA",
      code: "F001",
      isDefault: true,
    });

    expect(created.isDefault).toBe(true);
    expect(mock.filterCalls).toContainEqual({
      table: "voucher_series",
      method: "eq",
      args: ["is_default", true],
    });
    expect(mock.filterCalls).toContainEqual({
      table: "voucher_series",
      method: "eq",
      args: ["id", "s-1"],
    });
  });
});

describe("setDefaultSeries", () => {
  beforeEach(() => {
    mock.reset();
  });

  it("apaga el default de las demás series del tipo antes de asignarlo", async () => {
    mock.queueTable("voucher_series", { data: [], error: null });
    mock.queueTable("voucher_series", { data: [], error: null });

    await setDefaultSeries("s-1", "FACTURA");

    expect(mock.filterCalls).toContainEqual({
      table: "voucher_series",
      method: "eq",
      args: ["voucher_type", "FACTURA"],
    });
    expect(mock.filterCalls).toContainEqual({
      table: "voucher_series",
      method: "neq",
      args: ["id", "s-1"],
    });
  });
});

describe("softDeleteSeries", () => {
  beforeEach(() => {
    mock.reset();
  });

  it("hace baja lógica y apaga el default", async () => {
    mock.queueTable("voucher_series", { data: [], error: null });

    await softDeleteSeries("s-1");

    expect(mock.filterCalls).toContainEqual({
      table: "voucher_series",
      method: "eq",
      args: ["id", "s-1"],
    });
  });
});

describe("advanceSeriesNumber", () => {
  beforeEach(() => {
    mock.reset();
  });

  it("sube el correlativo si el número guardado es mayor", async () => {
    mock.queueTable("voucher_series", {
      data: [{ id: "s-1", last_number: 5 }],
      error: null,
    });
    mock.queueTable("voucher_series", { data: [], error: null });

    await advanceSeriesNumber("FACTURA", "f001-000130");

    expect(mock.filterCalls).toContainEqual({
      table: "voucher_series",
      method: "eq",
      args: ["code", "F001"],
    });
    expect(mock.filterCalls).toContainEqual({
      table: "voucher_series",
      method: "lt",
      args: ["last_number", 130],
    });
  });

  it("no actualiza si el correlativo es menor o igual al registrado", async () => {
    mock.queueTable("voucher_series", {
      data: [{ id: "s-1", last_number: 200 }],
      error: null,
    });

    await advanceSeriesNumber("FACTURA", "F001-000130");

    expect(
      mock.filterCalls.some((call) => call.method === "lt")
    ).toBe(false);
  });

  it("no actualiza si el prefijo no corresponde a una serie registrada", async () => {
    mock.queueTable("voucher_series", { data: [], error: null });

    await advanceSeriesNumber("FACTURA", "X999-000010");

    expect(
      mock.filterCalls.some((call) => call.method === "lt")
    ).toBe(false);
  });

  it("ignora números sin formato serie-correlativo", async () => {
    await advanceSeriesNumber("FACTURA", "SIN-GUION");

    expect(mock.filterCalls).toHaveLength(0);
  });
});
