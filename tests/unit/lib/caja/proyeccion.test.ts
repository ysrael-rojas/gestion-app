import { describe, expect, it } from "vitest";

import {
  buildCashFlowProjection,
  startOfWeek,
} from "@/lib/caja/proyeccion";
import type { VoucherBalance } from "@/components/pagos/types";

const voucher = (
  overrides: Partial<VoucherBalance> = {}
): VoucherBalance => ({
  comprobanteId: "c-1",
  entityId: "e-1",
  voucherKind: "VENTA",
  voucherType: "FACTURA",
  voucherNumber: "F001-000001",
  issueDate: "2026-10-01",
  effectiveDueDate: "2026-10-30",
  paymentType: "CREDITO",
  total: 100,
  paidAmount: 0,
  balance: 100,
  ...overrides,
});

describe("startOfWeek", () => {
  it("devuelve el lunes de la semana en curso", () => {
    // 2026-10-28 es miércoles → lunes 2026-10-26.
    expect(startOfWeek("2026-10-28")).toBe("2026-10-26");
  });

  it("un domingo pertenece a la semana que empezó el lunes anterior", () => {
    expect(startOfWeek("2026-11-01")).toBe("2026-10-26");
  });

  it("un lunes devuelve el mismo día", () => {
    expect(startOfWeek("2026-10-26")).toBe("2026-10-26");
  });
});

describe("buildCashFlowProjection", () => {
  it("reparte cobranzas y pagos en 4 semanas con saldo en cascada", () => {
    const projection = buildCashFlowProjection({
      today: "2026-10-28",
      currentBalance: 15450,
      receivables: [
        voucher({ comprobanteId: "r-vencida", effectiveDueDate: "2026-10-20", balance: 1500 }),
        voucher({ comprobanteId: "r-sem1", effectiveDueDate: "2026-10-30", balance: 2000 }),
        voucher({ comprobanteId: "r-sem2", effectiveDueDate: "2026-11-04", balance: 800 }),
      ],
      payables: [
        voucher({ comprobanteId: "p-sem1", voucherKind: "COMPRA", effectiveDueDate: "2026-10-31", balance: 3500 }),
        voucher({ comprobanteId: "p-vencida", voucherKind: "COMPRA", effectiveDueDate: "2026-10-01", balance: 500 }),
      ],
    });

    expect(projection.weeks).toHaveLength(4);
    expect(projection.weeks[0]).toMatchObject({
      start: "2026-10-26",
      end: "2026-11-01",
      overdueCollections: 1500,
      overduePayments: 500,
      collections: 2000,
      payments: 3500,
      closingBalance: 14950,
    });
    expect(projection.weeks[1]).toMatchObject({
      start: "2026-11-02",
      end: "2026-11-08",
      collections: 800,
      payments: 0,
      closingBalance: 15750,
    });
    expect(projection.weeks[2]?.closingBalance).toBe(15750);
    expect(projection.weeks[3]?.closingBalance).toBe(15750);
    expect(projection.hasNegativeWeek).toBe(false);
    expect(projection.firstNegativeWeekIndex).toBeNull();
  });

  it("separa el crédito sin fecha y no lo suma", () => {
    const projection = buildCashFlowProjection({
      today: "2026-10-28",
      currentBalance: 0,
      receivables: [voucher({ comprobanteId: "r-sin-fecha", effectiveDueDate: null, balance: 1200 })],
      payables: [],
    });

    expect(projection.unassigned.collections).toBe(1200);
    expect(projection.weeks.every((week) => week.closingBalance === 0)).toBe(
      true
    );
  });

  it("ignora lo que vence después de la cuarta semana", () => {
    const projection = buildCashFlowProjection({
      today: "2026-10-28",
      currentBalance: 100,
      receivables: [
        voucher({ comprobanteId: "r-lejos", effectiveDueDate: "2026-12-15", balance: 999 }),
      ],
      payables: [],
    });

    expect(projection.weeks.every((week) => week.collections === 0)).toBe(true);
    expect(projection.weeks[3]?.closingBalance).toBe(100);
  });

  it("marca la primera semana negativa", () => {
    const projection = buildCashFlowProjection({
      today: "2026-10-28",
      currentBalance: 100,
      receivables: [],
      payables: [
        voucher({ comprobanteId: "p-grande", voucherKind: "COMPRA", effectiveDueDate: "2026-10-29", balance: 500 }),
      ],
    });

    expect(projection.weeks[0]?.closingBalance).toBe(-400);
    expect(projection.hasNegativeWeek).toBe(true);
    expect(projection.firstNegativeWeekIndex).toBe(0);
  });

  it("ignora comprobantes sin saldo pendiente", () => {
    const projection = buildCashFlowProjection({
      today: "2026-10-28",
      currentBalance: 100,
      receivables: [voucher({ comprobanteId: "r-pagado", balance: 0 })],
      payables: [],
    });

    expect(projection.weeks.every((week) => week.collections === 0)).toBe(true);
    expect(projection.weeks[3]?.closingBalance).toBe(100);
  });

  it("redondea los totales a dos decimales", () => {
    const projection = buildCashFlowProjection({
      today: "2026-10-28",
      currentBalance: 0.1,
      receivables: [voucher({ comprobanteId: "r-1", balance: 0.2 })],
      payables: [],
    });

    expect(projection.weeks[0]?.closingBalance).toBe(0.3);
  });
});
