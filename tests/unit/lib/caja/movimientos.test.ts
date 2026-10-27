import { describe, expect, it } from "vitest";

import { cashMovementToPayment } from "@/lib/caja/movimientos";

const values = () => ({
  cashAccountId: "550e8400-e29b-41d4-a716-446655440000",
  direction: "EGRESO" as const,
  methodId: "550e8400-e29b-41d4-a716-446655440010",
  categoryId: "550e8400-e29b-41d4-a716-446655440011",
  amount: 25,
  movementDate: "2026-10-20",
  reference: "OP-1",
  notes: "Aporte",
});

describe("movimientos.ts", () => {
  it("mapea el movimiento a un recibo sin entidad, sin asignaciones y marcado", () => {
    const payment = cashMovementToPayment(values());

    expect(payment).toEqual({
      entityId: undefined,
      direction: "EGRESO",
      paymentDate: "2026-10-20",
      amount: 25,
      methodId: "550e8400-e29b-41d4-a716-446655440010",
      cashAccountId: "550e8400-e29b-41d4-a716-446655440000",
      categoryId: "550e8400-e29b-41d4-a716-446655440011",
      reference: "OP-1",
      notes: "Aporte",
      allocations: [],
      isCashMovement: true,
    });
  });

  it("respeta la dirección de ingreso", () => {
    expect(
      cashMovementToPayment({ ...values(), direction: "INGRESO" }).direction
    ).toBe("INGRESO");
  });
});
