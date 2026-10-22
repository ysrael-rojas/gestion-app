import { beforeEach, describe, expect, it, vi } from "vitest";

const { mock } = await vi.hoisted(async () => {
  const { createMockSupabase } = await import("@/tests/__mocks__/supabase");
  return { mock: createMockSupabase() };
});

vi.mock("@/lib/supabase/client", () => ({ supabase: mock.client }));

import { getVoucherById } from "@/lib/comprobantes/vouchers";

const voucherRow = (overrides: Record<string, unknown> = {}) => ({
  id: "c-1",
  issue_date: "2026-10-01",
  registration_date: "2026-10-01",
  voucher_type: "FACTURA",
  voucher_number: "F001-000001",
  entity_id: "e-1",
  voucher_kind: "VENTA",
  subtotal: 84.75,
  igv: 15.25,
  total: 100,
  payment_type: "CONTADO",
  credit_days: null,
  due_date: null,
  status: "PENDIENTE",
  deleted_at: null,
  ...overrides,
});

const balanceRow = (overrides: Record<string, unknown> = {}) => ({
  comprobante_id: "c-1",
  paid_amount: 30,
  balance: 70,
  ...overrides,
});

describe("vouchers.ts (getVoucherById)", () => {
  beforeEach(() => {
    mock.reset();
  });

  it("devuelve el comprobante mapeado con su saldo", async () => {
    mock.queueTable("comprobante", { data: [voucherRow()], error: null });
    mock.queueTable("voucher_balance", { data: [balanceRow()], error: null });

    const voucher = await getVoucherById("c-1", "VENTA");

    expect(voucher).toMatchObject({
      id: "c-1",
      voucherType: "FACTURA",
      voucherNumber: "F001-000001",
      entityId: "e-1",
      total: 100,
      paidAmount: 30,
      balance: 70,
    });
  });

  it("devuelve null cuando el comprobante no existe (PGRST116)", async () => {
    mock.queueTable("comprobante", {
      data: null,
      error: { code: "PGRST116", message: "no rows" },
    });
    mock.queueTable("voucher_balance", { data: [], error: null });

    await expect(getVoucherById("nope", "VENTA")).resolves.toBeNull();
  });

  it("devuelve null cuando la consulta no trae filas", async () => {
    mock.queueTable("comprobante", { data: [], error: null });
    mock.queueTable("voucher_balance", { data: [], error: null });

    await expect(getVoucherById("nope", "COMPRA")).resolves.toBeNull();
  });

  it("usa paidAmount 0 y balance = total cuando no hay fila en voucher_balance", async () => {
    mock.queueTable("comprobante", { data: [voucherRow()], error: null });
    mock.queueTable("voucher_balance", { data: [], error: null });

    const voucher = await getVoucherById("c-1", "VENTA");

    expect(voucher?.paidAmount).toBe(0);
    expect(voucher?.balance).toBe(100);
  });

  it("filtra por id, tipo de comprobante base y no dado de baja", async () => {
    mock.queueTable("comprobante", { data: [voucherRow()], error: null });
    mock.queueTable("voucher_balance", { data: [balanceRow()], error: null });

    await getVoucherById("c-1", "COMPRA");

    const kindFilter = mock.filterCalls.find(
      (call) =>
        call.table === "comprobante" &&
        call.method === "eq" &&
        call.args[0] === "voucher_kind"
    );
    expect(kindFilter?.args[1]).toBe("COMPRA");

    const idFilter = mock.filterCalls.find(
      (call) => call.table === "comprobante" && call.method === "eq" && call.args[0] === "id"
    );
    expect(idFilter?.args[1]).toBe("c-1");

    const typeFilter = mock.filterCalls.find(
      (call) =>
        call.table === "comprobante" &&
        call.method === "in" &&
        call.args[0] === "voucher_type"
    );
    expect(typeFilter?.args[1]).toEqual(["FACTURA", "BOLETA", "NOTA_VENTA"]);

    const deletedFilter = mock.filterCalls.find(
      (call) =>
        call.table === "comprobante" &&
        call.method === "is" &&
        call.args[0] === "deleted_at"
    );
    expect(deletedFilter?.args[1]).toBeNull();

    const balanceFilter = mock.filterCalls.find(
      (call) =>
        call.table === "voucher_balance" &&
        call.method === "eq" &&
        call.args[0] === "comprobante_id"
    );
    expect(balanceFilter?.args[1]).toBe("c-1");
  });

  it("lanza un error amigable si la consulta del comprobante falla", async () => {
    mock.queueTable("comprobante", {
      data: null,
      error: { code: "23514", message: "x" },
    });
    mock.queueTable("voucher_balance", { data: [], error: null });

    await expect(getVoucherById("c-1", "VENTA")).rejects.toThrow(
      "No se pudo cargar el comprobante. Intenta nuevamente."
    );
  });

  it("lanza un error si el saldo no se puede cargar", async () => {
    mock.queueTable("comprobante", { data: [voucherRow()], error: null });
    mock.queueTable("voucher_balance", {
      data: null,
      error: { message: "boom" },
    });

    await expect(getVoucherById("c-1", "VENTA")).rejects.toThrow(
      "No se pudo cargar el saldo del comprobante. Intenta nuevamente."
    );
  });
});
