import { beforeEach, describe, expect, it, vi } from "vitest";

const { mock } = await vi.hoisted(async () => {
  const { createMockSupabase } = await import("@/tests/__mocks__/supabase");
  return { mock: createMockSupabase() };
});

vi.mock("@/lib/supabase/client", () => ({ supabase: mock.client }));

import {
  createNotaRecord,
  listNotas,
  listReferableComprobantes,
  updateNotaRecord,
} from "@/lib/comprobantes/notas";
import type { NotaFormValues } from "@/lib/schemas/nota";

const notaRow = (overrides: Record<string, unknown> = {}) => ({
  id: "n-1",
  issue_date: "2026-10-17",
  registration_date: "2026-10-17",
  voucher_type: "NOTA_CREDITO",
  voucher_number: "FC01-000001",
  entity_id: "e-1",
  voucher_kind: "VENTA",
  subtotal: 100,
  igv: 18,
  total: 118,
  payment_type: "CONTADO",
  credit_days: null,
  due_date: null,
  status: "PAGADO",
  referenced_comprobante_id: "s-1",
  motive_code: "01",
  deleted_at: null,
  ...overrides,
});

const referencedSaleRow = (overrides: Record<string, unknown> = {}) => ({
  id: "s-1",
  entity_id: "e-1",
  voucher_kind: "VENTA",
  voucher_type: "FACTURA",
  voucher_number: "F001-000001",
  total: 1000,
  deleted_at: null,
  ...overrides,
});

const balanceRow = (overrides: Record<string, unknown> = {}) => ({
  comprobante_id: "s-1",
  entity_id: "e-1",
  voucher_kind: "VENTA",
  voucher_type: "FACTURA",
  voucher_number: "F001-000001",
  issue_date: "2026-10-01",
  total: 1000,
  paid_amount: 200,
  balance: 500,
  credit_amount: 300,
  debit_amount: 0,
  status: "PENDIENTE",
  ...overrides,
});

const validNotaForm = (): NotaFormValues => ({
  issueDate: "2026-10-17",
  voucherType: "NOTA_CREDITO",
  voucherNumber: "FC01-000001",
  total: 118,
  motiveCode: "01",
  referencedComprobanteId: "s-1",
});

describe("notas.ts", () => {
  beforeEach(() => {
    mock.reset();
  });

  describe("listNotas", () => {
    it("lista notas con el número y tipo del comprobante referenciado", async () => {
      mock.queueTable("comprobante", { data: [notaRow()], error: null });
      mock.queueTable("comprobante", {
        data: [referencedSaleRow()],
        error: null,
      });

      const notas = await listNotas("NOTA_CREDITO");

      expect(notas).toHaveLength(1);
      expect(notas[0]).toMatchObject({
        id: "n-1",
        voucherType: "NOTA_CREDITO",
        voucherNumber: "FC01-000001",
        motiveCode: "01",
        entityId: "e-1",
        total: 118,
        voucherKind: "VENTA",
        referencedId: "s-1",
        referencedNumber: "F001-000001",
        referencedType: "FACTURA",
      });
    });

    it("devuelve referencedNumber null si el referenciado no aparece", async () => {
      mock.queueTable("comprobante", { data: [notaRow()], error: null });
      mock.queueTable("comprobante", { data: [], error: null });

      const notas = await listNotas("NOTA_CREDITO");

      expect(notas[0]?.referencedNumber).toBeNull();
      expect(notas[0]?.referencedType).toBeNull();
    });

    it("lanza error traducido cuando la consulta falla", async () => {
      mock.queueTable("comprobante", {
        data: null,
        error: { code: "42501", message: "permission denied" },
      });
      mock.queueTable("comprobante", { data: [], error: null });

      await expect(listNotas("NOTA_CREDITO")).rejects.toThrow(
        "No se pudo completar la operación con la base de datos. Intenta nuevamente."
      );
    });
  });

  describe("listReferableComprobantes", () => {
    it("mapea la vista con saldo efectivo y crédito aplicado", async () => {
      mock.setTable("voucher_balance", {
        data: [balanceRow()],
        error: null,
      });

      const referables = await listReferableComprobantes("VENTA");

      expect(referables).toHaveLength(1);
      expect(referables[0]).toEqual({
        id: "s-1",
        entityId: "e-1",
        voucherKind: "VENTA",
        voucherType: "FACTURA",
        voucherNumber: "F001-000001",
        issueDate: "2026-10-01",
        total: 1000,
        paidAmount: 200,
        balance: 500,
        creditAmount: 300,
        status: "PENDIENTE",
      });
    });
  });

  describe("createNotaRecord", () => {
    it("crea una NC heredando entidad y tipo del referenciado", async () => {
      mock.queueTable("comprobante", {
        data: [referencedSaleRow()],
        error: null,
      });
      mock.queueTable("comprobante", { data: [], error: null });
      mock.queueTable("comprobante", { data: [notaRow()], error: null });

      const nota = await createNotaRecord(validNotaForm());

      expect(nota.id).toBe("n-1");
      expect(nota.referencedNumber).toBe("F001-000001");

      const payload = mock.insertCalls[0]?.payload as Record<string, unknown>;
      expect(mock.insertCalls[0]?.table).toBe("comprobante");
      expect(payload).toMatchObject({
        entity_id: "e-1",
        voucher_kind: "VENTA",
        voucher_type: "NOTA_CREDITO",
        voucher_number: "FC01-000001",
        subtotal: 100,
        igv: 18,
        total: 118,
        payment_type: "CONTADO",
        credit_days: null,
        status: "PAGADO",
        referenced_comprobante_id: "s-1",
        motive_code: "01",
      });
    });

    it("crea una retención sin motivo y con subtotal = total (igv 0)", async () => {
      mock.queueTable("comprobante", {
        data: [referencedSaleRow()],
        error: null,
      });
      mock.queueTable("comprobante", { data: [], error: null });
      mock.queueTable("comprobante", {
        data: [
          notaRow({
            voucher_type: "COMPROBANTE_RETENCION",
            voucher_number: "R001-000001",
            motive_code: null,
          }),
        ],
        error: null,
      });

      await createNotaRecord({
        ...validNotaForm(),
        voucherType: "COMPROBANTE_RETENCION",
        voucherNumber: "R001-000001",
        motiveCode: undefined,
      });

      const payload = mock.insertCalls[0]?.payload as Record<string, unknown>;
      expect(payload).toMatchObject({
        voucher_type: "COMPROBANTE_RETENCION",
        subtotal: 118,
        igv: 0,
        total: 118,
        motive_code: null,
      });
    });

    it("una ND no consulta los créditos aplicados (no consume el tope)", async () => {
      mock.queueTable("comprobante", {
        data: [referencedSaleRow()],
        error: null,
      });
      mock.queueTable("comprobante", {
        data: [notaRow({ voucher_type: "NOTA_DEBITO", motive_code: "02" })],
        error: null,
      });

      const nota = await createNotaRecord({
        ...validNotaForm(),
        voucherType: "NOTA_DEBITO",
        motiveCode: "02",
      });

      expect(nota.voucherType).toBe("NOTA_DEBITO");
      expect(mock.insertCalls).toHaveLength(1);
    });

    it("rechaza cuando la suma de créditos supera el total del referenciado", async () => {
      mock.queueTable("comprobante", {
        data: [referencedSaleRow({ total: 1000 })],
        error: null,
      });
      mock.queueTable("comprobante", {
        data: [{ id: "n-2", total: 900 }],
        error: null,
      });

      await expect(createNotaRecord(validNotaForm())).rejects.toThrow(
        "Las notas de crédito y retenciones no pueden superar el total del comprobante referenciado."
      );
      expect(mock.insertCalls).toHaveLength(0);
    });

    it("rechaza una referencia inexistente", async () => {
      mock.queueTable("comprobante", { data: [], error: null });

      await expect(createNotaRecord(validNotaForm())).rejects.toThrow(
        "El comprobante referenciado no existe."
      );
    });

    it("traduce el error PGRST116 de referencia inexistente", async () => {
      mock.queueTable("comprobante", {
        data: null,
        error: { code: "PGRST116", message: "JSON object requested..." },
      });

      await expect(createNotaRecord(validNotaForm())).rejects.toThrow(
        "El comprobante referenciado no existe."
      );
    });

    it("rechaza referenciar una nota en lugar de un comprobante base", async () => {
      mock.queueTable("comprobante", {
        data: [referencedSaleRow({ voucher_type: "NOTA_CREDITO" })],
        error: null,
      });

      await expect(createNotaRecord(validNotaForm())).rejects.toThrow(
        "Solo puedes referenciar factura, boleta o nota de venta."
      );
    });

    it("traduce el número duplicado (23505) a un mensaje claro", async () => {
      mock.queueTable("comprobante", {
        data: [referencedSaleRow()],
        error: null,
      });
      mock.queueTable("comprobante", { data: [], error: null });
      mock.queueTable("comprobante", {
        data: null,
        error: { code: "23505", message: "duplicate key" },
      });

      await expect(createNotaRecord(validNotaForm())).rejects.toThrow(
        "Ya registraste una nota con ese número de comprobante."
      );
    });

    it("traduce el duplicado de retención con su propio mensaje", async () => {
      mock.queueTable("comprobante", {
        data: [referencedSaleRow()],
        error: null,
      });
      mock.queueTable("comprobante", { data: [], error: null });
      mock.queueTable("comprobante", {
        data: null,
        error: { code: "23505", message: "duplicate key" },
      });

      await expect(
        createNotaRecord({
          ...validNotaForm(),
          voucherType: "COMPROBANTE_RETENCION",
          voucherNumber: "R001-000001",
          motiveCode: undefined,
        })
      ).rejects.toThrow(
        "Ya registraste una retención con ese número de comprobante."
      );
    });

    it("muestra el mensaje del trigger (P0001) tal cual", async () => {
      mock.queueTable("comprobante", {
        data: [referencedSaleRow()],
        error: null,
      });
      mock.queueTable("comprobante", { data: [], error: null });
      mock.queueTable("comprobante", {
        data: null,
        error: {
          code: "P0001",
          message: "El comprobante referenciado es de otro usuario",
        },
      });

      await expect(createNotaRecord(validNotaForm())).rejects.toThrow(
        "El comprobante referenciado es de otro usuario"
      );
    });

    it("traduce el CHECK (23514) a un mensaje en español", async () => {
      mock.queueTable("comprobante", {
        data: [referencedSaleRow()],
        error: null,
      });
      mock.queueTable("comprobante", { data: [], error: null });
      mock.queueTable("comprobante", {
        data: null,
        error: { code: "23514", message: "check constraint" },
      });

      await expect(createNotaRecord(validNotaForm())).rejects.toThrow(
        "Los datos de la nota no son válidos."
      );
    });
  });

  describe("updateNotaRecord", () => {
    it("actualiza y devuelve la nota mapeada", async () => {
      mock.queueTable("comprobante", {
        data: [referencedSaleRow()],
        error: null,
      });
      mock.queueTable("comprobante", { data: [], error: null });
      mock.queueTable("comprobante", {
        data: [notaRow({ total: 236, subtotal: 200, igv: 36 })],
        error: null,
      });

      const nota = await updateNotaRecord("n-1", {
        ...validNotaForm(),
        total: 236,
      });

      expect(nota.id).toBe("n-1");
      expect(nota.total).toBe(236);
    });

    it("rechaza la edición si los otros créditos más el nuevo total superan el tope", async () => {
      mock.queueTable("comprobante", {
        data: [referencedSaleRow({ total: 1000 })],
        error: null,
      });
      mock.queueTable("comprobante", {
        data: [{ id: "n-2", total: 950 }],
        error: null,
      });

      await expect(
        updateNotaRecord("n-1", { ...validNotaForm(), total: 118 })
      ).rejects.toThrow(
        "Las notas de crédito y retenciones no pueden superar el total del comprobante referenciado."
      );
    });
  });
});
