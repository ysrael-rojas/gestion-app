import { describe, expect, it } from "vitest";
import { distributeOldestFirst } from "@/lib/pagos/auto-distribuir";
import type { VoucherBalance } from "@/components/pagos/types";

function makeVoucher(
  comprobanteId: string,
  overrides: Partial<VoucherBalance> = {}
): VoucherBalance {
  return {
    comprobanteId,
    entityId: "entity-1",
    voucherKind: "VENTA",
    voucherType: "FACTURA",
    voucherNumber: `F001-${comprobanteId}`,
    issueDate: "2026-09-01",
    effectiveDueDate: null,
    paymentType: "CREDITO",
    total: 100,
    paidAmount: 0,
    balance: 100,
    ...overrides,
  };
}

function sumAssignments(result: Map<string, number>): number {
  return [...result.values()].reduce((sum, amount) => sum + amount, 0);
}

describe("distributeOldestFirst", () => {
  it("cubre primero las deudas más antiguas y reparte el remanente en la más nueva", () => {
    const older = makeVoucher("older", {
      issueDate: "2026-08-01",
      effectiveDueDate: "2026-08-15",
      balance: 100,
    });
    const newer = makeVoucher("newer", {
      issueDate: "2026-09-01",
      effectiveDueDate: "2026-09-15",
      balance: 200,
    });

    // Desordenados a propósito: la función debe ordenar por antigüedad.
    const result = distributeOldestFirst([newer, older], 250);

    expect(result.get("older")).toBe(100);
    expect(result.get("newer")).toBe(150);
    expect(sumAssignments(result)).toBe(250);
  });

  it("ordena por effectiveDueDate y cae a issueDate cuando no hay vencimiento", () => {
    // Sin vencimiento (CONTADO): usa issueDate, más antigua que el vencimiento del crédito.
    const contado = makeVoucher("contado", {
      issueDate: "2026-07-01",
      effectiveDueDate: null,
      balance: 50,
    });
    const credito = makeVoucher("credito", {
      issueDate: "2026-09-01",
      effectiveDueDate: "2026-08-15",
      balance: 50,
    });

    const result = distributeOldestFirst([credito, contado], 60);

    expect(result.get("contado")).toBe(50);
    expect(result.get("credito")).toBe(10);
  });

  it("desempata por issueDate cuando el vencimiento coincide", () => {
    const firstIssued = makeVoucher("first", {
      issueDate: "2026-08-01",
      effectiveDueDate: "2026-09-15",
      balance: 50,
    });
    const lastIssued = makeVoucher("last", {
      issueDate: "2026-08-20",
      effectiveDueDate: "2026-09-15",
      balance: 50,
    });

    const result = distributeOldestFirst([lastIssued, firstIssued], 60);

    expect(result.get("first")).toBe(50);
    expect(result.get("last")).toBe(10);
  });

  it("deja el excedente sin asignar cuando el importe supera la suma de deudas", () => {
    const oldest = makeVoucher("oldest", {
      issueDate: "2026-08-01",
      balance: 100,
    });
    const newest = makeVoucher("newest", {
      issueDate: "2026-09-01",
      balance: 200,
    });

    const result = distributeOldestFirst([newest, oldest], 500);

    expect(result.get("oldest")).toBe(100);
    expect(result.get("newest")).toBe(200);
    expect(sumAssignments(result)).toBe(300);
  });

  it("devuelve un mapa vacío cuando el importe es 0", () => {
    const voucher = makeVoucher("zero-amount");

    expect(distributeOldestFirst([voucher], 0).size).toBe(0);
  });

  it("devuelve un mapa vacío cuando el importe es negativo", () => {
    const voucher = makeVoucher("negative-amount");

    expect(distributeOldestFirst([voucher], -50).size).toBe(0);
  });

  it("devuelve un mapa vacío cuando no hay comprobantes", () => {
    expect(distributeOldestFirst([], 100).size).toBe(0);
  });

  it("ignora comprobantes sin saldo y no devuelve asignaciones en 0", () => {
    const open = makeVoucher("open", {
      issueDate: "2026-08-01",
      balance: 100,
    });
    const closed = makeVoucher("closed", {
      issueDate: "2026-07-01",
      balance: 0,
    });

    const result = distributeOldestFirst([closed, open], 50);

    expect(result.size).toBe(1);
    expect(result.get("open")).toBe(50);
  });

  it("trabaja en centavos exactos sin drift de redondeo", () => {
    const first = makeVoucher("cents-first", {
      issueDate: "2026-08-01",
      balance: 33.33,
    });
    const second = makeVoucher("cents-second", {
      issueDate: "2026-09-01",
      balance: 66.67,
    });

    const result = distributeOldestFirst([second, first], 100);

    expect(result.get("cents-first")).toBe(33.33);
    expect(result.get("cents-second")).toBe(66.67);
    expect(sumAssignments(result)).toBe(100);
  });

  it("asigna el remanente exacto al último comprobante cubierto", () => {
    const first = makeVoucher("partial-first", {
      issueDate: "2026-08-01",
      balance: 10.1,
    });
    const second = makeVoucher("partial-second", {
      issueDate: "2026-09-01",
      balance: 20.2,
    });
    const third = makeVoucher("partial-third", {
      issueDate: "2026-10-01",
      balance: 30.3,
    });

    const result = distributeOldestFirst([third, second, first], 40.4);

    expect(result.get("partial-first")).toBe(10.1);
    expect(result.get("partial-second")).toBe(20.2);
    expect(result.get("partial-third")).toBe(10.1);
    expect(sumAssignments(result)).toBe(40.4);
  });
});
