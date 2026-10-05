import { beforeEach, describe, expect, it, vi } from "vitest";

const { mock } = await vi.hoisted(async () => {
  const { createMockSupabase } = await import("@/tests/__mocks__/supabase");
  return { mock: createMockSupabase() };
});

vi.mock("@/lib/supabase/client", () => ({ supabase: mock.client }));
vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
  return {
    ...actual,
    getTodayLocalDate: () => "2026-10-01",
  };
});

import {
  getCarteraResumen,
  listOpenVouchers,
  listUnassignedPayments,
} from "@/lib/pagos/cartera";

const voucherBalanceRow = (overrides: Record<string, unknown> = {}) => ({
  comprobante_id: "c-1",
  entity_id: "e-1",
  voucher_kind: "VENTA",
  voucher_type: "FACTURA",
  voucher_number: "F001-000001",
  issue_date: "2026-09-15",
  effective_due_date: "2026-09-30",
  payment_type: "CREDITO",
  total: 100,
  paid_amount: 0,
  balance: 100,
  ...overrides,
});

const paymentBalanceRow = (overrides: Record<string, unknown> = {}) => ({
  payment_id: "p-1",
  entity_id: "e-1",
  direction: "INGRESO",
  amount: 50,
  assigned_amount: 30,
  unassigned_amount: 20,
  status: "REGISTRADO",
  ...overrides,
});

const paymentRow = (overrides: Record<string, unknown> = {}) => ({
  id: "p-1",
  entity_id: "e-1",
  direction: "INGRESO",
  issue_date: "2026-09-30",
  payment_date: "2026-09-30",
  receipt_serial: 1,
  receipt_number: "RI-000001",
  amount: 50,
  method: "EFECTIVO",
  reference: null,
  status: "REGISTRADO",
  void_reason: null,
  voided_at: null,
  notes: null,
  ...overrides,
});

describe("cartera.ts", () => {
  beforeEach(() => {
    mock.reset();
  });

  describe("getCarteraResumen", () => {
    it("construye buckets separando VENTA/COMPRA e INGRESO/EGRESO", async () => {
      mock.setTable("voucher_balance", {
        data: [
          voucherBalanceRow({
            comprobante_id: "c-1",
            voucher_kind: "VENTA",
            balance: 100,
            effective_due_date: "2026-10-15",
          }),
          voucherBalanceRow({
            comprobante_id: "c-2",
            voucher_kind: "VENTA",
            balance: 50,
            effective_due_date: "2026-09-20",
          }),
          voucherBalanceRow({
            comprobante_id: "c-3",
            voucher_kind: "COMPRA",
            balance: 200,
          }),
        ],
        error: null,
      });
      mock.setTable("payment_balance", {
        data: [
          paymentBalanceRow({ payment_id: "p-1", direction: "INGRESO", unassigned_amount: 20 }),
          paymentBalanceRow({ payment_id: "p-2", direction: "EGRESO", unassigned_amount: 30 }),
        ],
        error: null,
      });

      const resumen = await getCarteraResumen();

      expect(resumen.today).toBe("2026-10-01");
      expect(resumen.receivable.count).toBe(2);
      expect(resumen.receivable.amount).toBe(150);
      expect(resumen.receivable.overdueCount).toBe(1);
      expect(resumen.receivable.overdueAmount).toBe(50);
      expect(resumen.payable.count).toBe(1);
      expect(resumen.payable.amount).toBe(200);
      expect(resumen.unassignedReceipts.amount).toBe(20);
      expect(resumen.unassignedPayments.amount).toBe(30);
    });

    it("cuenta anticipos sin entidad en el bucket de sin asignar", async () => {
      mock.setTable("voucher_balance", { data: [], error: null });
      mock.setTable("payment_balance", {
        data: [
          paymentBalanceRow({
            payment_id: "p-9",
            entity_id: null,
            direction: "INGRESO",
            unassigned_amount: 40,
          }),
        ],
        error: null,
      });

      const resumen = await getCarteraResumen();

      expect(resumen.unassignedReceipts.count).toBe(1);
      expect(resumen.unassignedReceipts.amount).toBe(40);
    });

    it("lanza error cuando la consulta de voucher_balance falla", async () => {
      mock.setTable("voucher_balance", { data: [], error: { message: "boom" } });
      mock.setTable("payment_balance", { data: [], error: null });

      await expect(getCarteraResumen()).rejects.toThrow(
        "No se pudo cargar el resumen de cartera. Intenta nuevamente.",
      );
    });

    it("lanza error cuando la consulta de payment_balance falla", async () => {
      mock.setTable("voucher_balance", { data: [], error: null });
      mock.setTable("payment_balance", { data: [], error: { message: "boom" } });

      await expect(getCarteraResumen()).rejects.toThrow(
        "No se pudo cargar el resumen de cartera. Intenta nuevamente.",
      );
    });
  });

  describe("listOpenVouchers", () => {
    it("mapea INGRESO a VENTA y devuelve los comprobantes", async () => {
      mock.setTable("voucher_balance", {
        data: [voucherBalanceRow({ comprobante_id: "c-1", voucher_kind: "VENTA", balance: 100 })],
        error: null,
      });

      const result = await listOpenVouchers("INGRESO");

      expect(result).toHaveLength(1);
      expect(result[0]?.comprobanteId).toBe("c-1");
      expect(result[0]?.voucherKind).toBe("VENTA");
    });

    it("mapea EGRESO a COMPRA", async () => {
      mock.setTable("voucher_balance", {
        data: [voucherBalanceRow({ comprobante_id: "c-3", voucher_kind: "COMPRA", balance: 200 })],
        error: null,
      });

      const result = await listOpenVouchers("EGRESO");

      expect(result).toHaveLength(1);
      expect(result[0]?.voucherKind).toBe("COMPRA");
    });

    it("lanza error si la consulta falla", async () => {
      mock.setTable("voucher_balance", { data: [], error: { message: "boom" } });

      await expect(listOpenVouchers("INGRESO")).rejects.toThrow(
        "No se pudo cargar el resumen de cartera. Intenta nuevamente.",
      );
    });
  });

  describe("listUnassignedPayments", () => {
    it("devuelve array vacío cuando no hay payment_ids", async () => {
      mock.setTable("payment_balance", { data: [], error: null });

      const result = await listUnassignedPayments("INGRESO");

      expect(result).toEqual([]);
    });

    it("consulta payment con los IDs de payment_balance", async () => {
      mock.setTable("payment_balance", {
        data: [
          paymentBalanceRow({ payment_id: "p-1" }),
          paymentBalanceRow({ payment_id: "p-2" }),
        ],
        error: null,
      });
      mock.setTable("payment", {
        data: [
          paymentRow({ id: "p-1" }),
          paymentRow({ id: "p-2", receipt_serial: 2, receipt_number: "RI-000002" }),
        ],
        error: null,
      });

      const result = await listUnassignedPayments("INGRESO");

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe("p-1");
      expect(result[1]?.id).toBe("p-2");
    });

    it("tolera entity_id null (anticipo sin entidad)", async () => {
      mock.setTable("payment_balance", {
        data: [paymentBalanceRow({ payment_id: "p-9" })],
        error: null,
      });
      mock.setTable("payment", {
        data: [paymentRow({ id: "p-9", entity_id: null })],
        error: null,
      });

      const result = await listUnassignedPayments("INGRESO");

      expect(result).toHaveLength(1);
      expect(result[0]?.entityId).toBeNull();
    });

    it("lanza error cuando falla la consulta de payment_balance", async () => {
      mock.setTable("payment_balance", { data: [], error: { message: "boom" } });

      await expect(listUnassignedPayments("INGRESO")).rejects.toThrow(
        "No se pudo cargar el resumen de cartera. Intenta nuevamente.",
      );
    });

    it("lanza error cuando falla la consulta de payment", async () => {
      mock.setTable("payment_balance", { data: [paymentBalanceRow()], error: null });
      mock.setTable("payment", { data: [], error: { message: "boom" } });

      await expect(listUnassignedPayments("INGRESO")).rejects.toThrow(
        "No se pudo cargar el resumen de cartera. Intenta nuevamente.",
      );
    });
  });
});
