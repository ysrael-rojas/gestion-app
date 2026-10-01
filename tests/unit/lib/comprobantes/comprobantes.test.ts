import { beforeEach, describe, expect, it, vi } from "vitest";

const { mock } = await vi.hoisted(async () => {
  const { createMockSupabase } = await import("@/tests/__mocks__/supabase");
  return { mock: createMockSupabase() };
});

vi.mock("@/lib/supabase/client", () => ({ supabase: mock.client }));

import {
  BalanceLoadError,
  createSaleRecord,
  listSales,
  updateSaleRecord,
} from "@/lib/comprobantes/comprobantes";
import type { SaleFormValues } from "@/lib/schemas/sale";

const saleRow = (overrides: Record<string, unknown> = {}) => ({
  id: "s-1",
  issue_date: "2026-09-30",
  registration_date: "2026-09-30",
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

const saleBalanceRow = (overrides: Record<string, unknown> = {}) => ({
  comprobante_id: "s-1",
  voucher_kind: "VENTA",
  paid_amount: 30,
  balance: 70,
  ...overrides,
});

const validForm = (): SaleFormValues => ({
  entityId: "e-1",
  voucherType: "FACTURA",
  voucherNumber: "F001-000001",
  issueDate: "2026-10-01",
  total: 100,
  paymentType: "CONTADO",
  status: "PENDIENTE",
});

describe("comprobantes.ts (ventas)", () => {
  beforeEach(() => {
    mock.reset();
  });

  describe("listSales", () => {
    it("devuelve { sales, balanceError: null } con balances correctos", async () => {
      mock.queueTable("comprobante", {
        data: [saleRow({ id: "s-1", total: 100 }), saleRow({ id: "s-2", total: 200, voucher_number: "F001-000002" })],
        error: null,
      });
      mock.queueTable("voucher_balance", {
        data: [
          saleBalanceRow({ comprobante_id: "s-1", paid_amount: 30, balance: 70 }),
          saleBalanceRow({ comprobante_id: "s-2", paid_amount: 100, balance: 100 }),
        ],
        error: null,
      });

      const result = await listSales();

      expect(result.balanceError).toBeNull();
      expect(result.sales).toHaveLength(2);
      expect(result.sales[0]).toMatchObject({
        id: "s-1",
        paidAmount: 30,
        balance: 70,
      });
      expect(result.sales[1]).toMatchObject({
        id: "s-2",
        paidAmount: 100,
        balance: 100,
      });
    });

    it("devuelve sales con balance = total cuando no hay filas en voucher_balance", async () => {
      mock.queueTable("comprobante", { data: [saleRow()], error: null });
      mock.queueTable("voucher_balance", { data: [], error: null });

      const result = await listSales();

      expect(result.balanceError).toBeNull();
      expect(result.sales).toHaveLength(1);
      expect(result.sales[0]?.paidAmount).toBe(0);
      expect(result.sales[0]?.balance).toBe(100);
    });

    it("devuelve { sales: [], balanceError: BalanceLoadError } cuando voucher_balance falla (no traga el error)", async () => {
      mock.queueTable("comprobante", { data: [saleRow()], error: null });
      mock.queueTable("voucher_balance", {
        data: null,
        error: { message: "boom", code: "PGRST301" },
      });

      const result = await listSales();

      expect(result.balanceError).toBeInstanceOf(BalanceLoadError);
      expect(result.balanceError?.source).toBe("balance");
      expect(result.sales).toHaveLength(1);
      expect(result.sales[0]?.paidAmount).toBe(0);
      expect(result.sales[0]?.balance).toBe(100);
    });

    it("lanza error si la consulta de comprobante falla (sin afectar balanceError)", async () => {
      mock.queueTable("comprobante", {
        data: null,
        error: { code: "23514", message: "x" },
      });

      await expect(listSales()).rejects.toThrow(
        "Los datos del comprobante no son válidos.",
      );
    });
  });

  describe("createSaleRecord", () => {
    it("mapea los valores con subtotal/igv derivados del total", async () => {
      mock.setTable("comprobante", { data: [saleRow()], error: null });

      const sale = await createSaleRecord(validForm());

      expect(sale.id).toBe("s-1");
      expect(sale.voucherNumber).toBe("F001-000001");
    });

    it("traduce error 23503 a mensaje amigable", async () => {
      mock.setTable("comprobante", {
        data: null,
        error: { code: "23503", message: "x" },
      });

      await expect(createSaleRecord(validForm())).rejects.toThrow(
        "El cliente seleccionado no existe.",
      );
    });
  });

  describe("updateSaleRecord", () => {
    it("hace update por id y devuelve el comprobante mapeado", async () => {
      mock.setTable("comprobante", { data: [saleRow()], error: null });

      const sale = await updateSaleRecord("s-1", validForm());

      expect(sale.id).toBe("s-1");
    });
  });
});
