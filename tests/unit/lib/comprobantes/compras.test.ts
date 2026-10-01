import { beforeEach, describe, expect, it, vi } from "vitest";

const { mock } = await vi.hoisted(async () => {
  const { createMockSupabase } = await import("@/tests/__mocks__/supabase");
  return { mock: createMockSupabase() };
});

vi.mock("@/lib/supabase/client", () => ({ supabase: mock.client }));

import {
  BalanceLoadError,
  createPurchaseRecord,
  listPurchases,
  updatePurchaseRecord,
} from "@/lib/comprobantes/compras";
import type { PurchaseFormValues } from "@/lib/schemas/purchase";

const purchaseRow = (overrides: Record<string, unknown> = {}) => ({
  id: "p-1",
  issue_date: "2026-09-30",
  registration_date: "2026-09-30",
  voucher_type: "FACTURA",
  voucher_number: "F001-000001",
  entity_id: "sup-1",
  voucher_kind: "COMPRA",
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

const purchaseBalanceRow = (overrides: Record<string, unknown> = {}) => ({
  comprobante_id: "p-1",
  voucher_kind: "COMPRA",
  paid_amount: 20,
  balance: 80,
  ...overrides,
});

const validForm = (): PurchaseFormValues => ({
  supplierId: "sup-1",
  voucherType: "FACTURA",
  voucherNumber: "F001-000001",
  issueDate: "2026-10-01",
  total: 100,
  paymentType: "CONTADO",
  status: "PENDIENTE",
});

describe("compras.ts", () => {
  beforeEach(() => {
    mock.reset();
  });

  describe("listPurchases", () => {
    it("devuelve { purchases, balanceError: null } con balances correctos", async () => {
      mock.queueTable("comprobante", {
        data: [purchaseRow({ id: "p-1", total: 100 }), purchaseRow({ id: "p-2", total: 200, voucher_number: "F001-000002" })],
        error: null,
      });
      mock.queueTable("voucher_balance", {
        data: [
          purchaseBalanceRow({ comprobante_id: "p-1", paid_amount: 20, balance: 80 }),
          purchaseBalanceRow({ comprobante_id: "p-2", paid_amount: 0, balance: 200 }),
        ],
        error: null,
      });

      const result = await listPurchases();

      expect(result.balanceError).toBeNull();
      expect(result.purchases).toHaveLength(2);
      expect(result.purchases[0]).toMatchObject({
        id: "p-1",
        paidAmount: 20,
        balance: 80,
      });
    });

    it("devuelve purchases con balance = total cuando voucher_balance está vacío", async () => {
      mock.queueTable("comprobante", { data: [purchaseRow()], error: null });
      mock.queueTable("voucher_balance", { data: [], error: null });

      const result = await listPurchases();

      expect(result.balanceError).toBeNull();
      expect(result.purchases).toHaveLength(1);
      expect(result.purchases[0]?.paidAmount).toBe(0);
      expect(result.purchases[0]?.balance).toBe(100);
    });

    it("devuelve { purchases: [], balanceError: BalanceLoadError } cuando voucher_balance falla", async () => {
      mock.queueTable("comprobante", { data: [purchaseRow()], error: null });
      mock.queueTable("voucher_balance", {
        data: null,
        error: { message: "boom", code: "PGRST301" },
      });

      const result = await listPurchases();

      expect(result.balanceError).toBeInstanceOf(BalanceLoadError);
      expect(result.balanceError?.source).toBe("balance");
      expect(result.purchases).toHaveLength(1);
      expect(result.purchases[0]?.paidAmount).toBe(0);
      expect(result.purchases[0]?.balance).toBe(100);
    });

    it("lanza error si la consulta de comprobante falla", async () => {
      mock.queueTable("comprobante", {
        data: null,
        error: { code: "23503", message: "x" },
      });

      await expect(listPurchases()).rejects.toThrow(
        "El proveedor seleccionado no existe.",
      );
    });
  });

  describe("createPurchaseRecord", () => {
    it("inserta comprobante con voucher_kind COMPRA y devuelve mapeado", async () => {
      mock.setTable("comprobante", { data: [purchaseRow()], error: null });

      const purchase = await createPurchaseRecord(validForm());

      expect(purchase.id).toBe("p-1");
      expect(purchase.supplierId).toBe("sup-1");
    });

    it("traduce error 23514 a mensaje amigable", async () => {
      mock.setTable("comprobante", {
        data: null,
        error: { code: "23514", message: "x" },
      });

      await expect(createPurchaseRecord(validForm())).rejects.toThrow(
        "Los datos del comprobante no son válidos.",
      );
    });
  });

  describe("updatePurchaseRecord", () => {
    it("hace update por id y devuelve el comprobante mapeado", async () => {
      mock.setTable("comprobante", { data: [purchaseRow()], error: null });

      const purchase = await updatePurchaseRecord("p-1", validForm());

      expect(purchase.id).toBe("p-1");
    });
  });
});
