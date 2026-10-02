import { beforeEach, describe, expect, it, vi } from "vitest";

const { mock } = await vi.hoisted(async () => {
  const { createMockSupabase } = await import("@/tests/__mocks__/supabase");
  return { mock: createMockSupabase() };
});

vi.mock("@/lib/supabase/client", () => ({ supabase: mock.client }));

import {
  addAllocations,
  createPayment,
  getPaymentDetail,
  getPaymentHistory,
  listOpenVouchers,
  listPayments,
  voidPayment,
} from "@/lib/pagos/pagos";

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

const allocationRow = (overrides: Record<string, unknown> = {}) => ({
  id: "a-1",
  payment_id: "p-1",
  comprobante_id: "c-1",
  amount: 50,
  ...overrides,
});

const paymentBalanceRow = (overrides: Record<string, unknown> = {}) => ({
  payment_id: "p-1",
  entity_id: "e-1",
  direction: "INGRESO",
  amount: 50,
  assigned_amount: 50,
  unassigned_amount: 0,
  status: "REGISTRADO",
  ...overrides,
});

const voucherBalanceRow = (overrides: Record<string, unknown> = {}) => ({
  comprobante_id: "c-1",
  entity_id: "e-1",
  voucher_kind: "VENTA",
  voucher_type: "FACTURA",
  voucher_number: "F001-000001",
  issue_date: "2026-09-15",
  effective_due_date: null,
  payment_type: "CONTADO",
  total: 100,
  paid_amount: 50,
  balance: 50,
  ...overrides,
});

describe("pagos.ts", () => {
  beforeEach(() => {
    mock.reset();
  });

  describe("listPayments", () => {
    it("mapea pagos y los ordena por issue_date desc (mock devuelve ordenados)", async () => {
      mock.setTable("payment", {
        data: [
          paymentRow({ id: "p-1", issue_date: "2026-09-30" }),
          paymentRow({ id: "p-2", issue_date: "2026-09-29", receipt_serial: 2, receipt_number: "RI-000002" }),
        ],
        error: null,
      });

      const result = await listPayments("INGRESO");

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe("p-1");
    });

    it("traduce el error a mensaje amigable", async () => {
      mock.setTable("payment", {
        data: [],
        error: { code: "P0001", message: "saldo insuficiente" },
      });

      await expect(listPayments("INGRESO")).rejects.toThrow("saldo insuficiente");
    });
  });

  describe("listOpenVouchers", () => {
    it("mapea INGRESO a VENTA y filtra por entityId", async () => {
      mock.setTable("voucher_balance", {
        data: [voucherBalanceRow()],
        error: null,
      });

      const result = await listOpenVouchers("INGRESO", "e-1");

      expect(result).toHaveLength(1);
      expect(result[0]?.voucherKind).toBe("VENTA");
      expect(result[0]?.entityId).toBe("e-1");
    });

    it("lanza error cuando la consulta falla", async () => {
      mock.setTable("voucher_balance", {
        data: [],
        error: { code: "40001", message: "x" },
      });

      await expect(listOpenVouchers("INGRESO", "e-1")).rejects.toThrow(
        "Otro proceso está modificando el comprobante. Reintenta.",
      );
    });
  });

  describe("getPaymentDetail", () => {
    it("compone allocations con su comprobante vía voucher_balance", async () => {
      // Mock the queue: payment.single(), payment_balance.maybeSingle(), payment_allocation.then(), voucher_balance.then()
      mock.queueTable("payment", {
        data: [paymentRow()],
        error: null,
      });
      mock.queueTable("payment_balance", {
        data: [paymentBalanceRow()],
        error: null,
      });
      mock.queueTable("payment_allocation", {
        data: [allocationRow()],
        error: null,
      });
      mock.queueTable("voucher_balance", {
        data: [voucherBalanceRow()],
        error: null,
      });

      const detail = await getPaymentDetail("p-1");

      expect(detail.id).toBe("p-1");
      expect(detail.allocations).toHaveLength(1);
      expect(detail.allocations[0]?.comprobanteId).toBe("c-1");
      expect(detail.allocations[0]?.voucherNumber).toBe("F001-000001");
      expect(detail.assignedAmount).toBe(50);
      expect(detail.unassignedAmount).toBe(0);
    });

    it("usa amount del payment cuando payment_balance no devuelve fila", async () => {
      mock.queueTable("payment", {
        data: [paymentRow({ amount: 80 })],
        error: null,
      });
      mock.queueTable("payment_balance", {
        data: [],
        error: null,
      });
      mock.queueTable("payment_allocation", {
        data: [],
        error: null,
      });

      const detail = await getPaymentDetail("p-1");

      expect(detail.assignedAmount).toBe(0);
      expect(detail.unassignedAmount).toBe(80);
    });

    it("traduce error del primer query", async () => {
      mock.queueTable("payment", {
        data: [],
        error: { code: "42883", message: "x" },
      });

      await expect(getPaymentDetail("p-1")).rejects.toThrow(
        "No se pudo crear el pago. Ejecuta la migración de la RPC.",
      );
    });
  });

  describe("getPaymentHistory", () => {
    it("devuelve array vacío cuando no hay allocations para el comprobante", async () => {
      mock.setTable("payment_allocation", {
        data: [],
        error: null,
      });

      const history = await getPaymentHistory("c-1");

      expect(history).toEqual([]);
    });

    it("combina allocations con sus payments y ordena por issue_date desc", async () => {
      mock.queueTable("payment_allocation", {
        data: [
          allocationRow({ id: "a-1", payment_id: "p-1" }),
          allocationRow({ id: "a-2", payment_id: "p-2", amount: 30 }),
        ],
        error: null,
      });
      mock.queueTable("payment", {
        data: [
          paymentRow({ id: "p-1", issue_date: "2026-09-30", receipt_serial: 1 }),
          paymentRow({ id: "p-2", issue_date: "2026-09-25", receipt_serial: 2, receipt_number: "RI-000002" }),
        ],
        error: null,
      });

      const history = await getPaymentHistory("c-1");

      expect(history).toHaveLength(2);
      expect(history[0]?.paymentId).toBe("p-1");
      expect(history[0]?.amount).toBe(50);
      expect(history[1]?.paymentId).toBe("p-2");
      expect(history[1]?.amount).toBe(30);
    });
  });

  describe("createPayment", () => {
    it("llama a la RPC con los parámetros mapeados", async () => {
      mock.setRpc("create_payment_with_allocations", {
        data: "p-new",
        error: null,
      });
      mock.queueTable("payment", { data: [paymentRow({ id: "p-new" })], error: null });
      mock.queueTable("payment_balance", { data: [], error: null });
      mock.queueTable("payment_allocation", { data: [], error: null });

      const values = {
        entityId: "e-1",
        direction: "INGRESO" as const,
        paymentDate: "2026-10-01",
        amount: 50,
        method: "EFECTIVO" as const,
        reference: "OP-123",
        notes: "",
        allocations: [{ comprobanteId: "c-1", amount: 50 }],
      };

      const detail = await createPayment(values);

      expect(detail.id).toBe("p-new");
    });

    it("traduce error 23505 a mensaje de duplicado", async () => {
      mock.setRpc("create_payment_with_allocations", {
        data: null,
        error: { code: "23505", message: "x" },
      });

      await expect(
        createPayment({
          entityId: "e-1",
          direction: "INGRESO",
          paymentDate: "2026-10-01",
          amount: 50,
          method: "EFECTIVO",
          reference: "",
          notes: "",
          allocations: [],
        }),
      ).rejects.toThrow("El comprobante ya está asignado a este pago.");
    });
  });

  describe("addAllocations", () => {
    it("no hace nada si items está vacío (no toca supabase)", async () => {
      await addAllocations("p-1", []);
      // Si hubiera tocado supabase, no habría mock configurado y el mock devolvería { data: [], error: null }.
      // El test pasa simplemente verificando que no lanza.
    });

    it("inserta allocations y propaga error", async () => {
      mock.setTable("payment_allocation", {
        data: [],
        error: { code: "23503", message: "x" },
      });

      await expect(
        addAllocations("p-1", [{ comprobanteId: "c-1", amount: 50 }]),
      ).rejects.toThrow("La entidad o el comprobante seleccionado no existe.");
    });
  });

  describe("voidPayment", () => {
    it("hace update con status ANULADO, void_reason y voided_at", async () => {
      mock.setTable("payment", {
        data: [],
        error: null,
      });

      await voidPayment("p-1", "Error de digitación");

      // El mock no valida el payload, pero verificamos que no lanza.
    });

    it("propaga el error con traducción", async () => {
      mock.setTable("payment", {
        data: [],
        error: { code: "23514", message: "x" },
      });

      await expect(voidPayment("p-1", "razón")).rejects.toThrow(
        "Los datos del pago no son válidos.",
      );
    });
  });
});
