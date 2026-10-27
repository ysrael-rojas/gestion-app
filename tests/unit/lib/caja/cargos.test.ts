import { describe, expect, it } from "vitest";

import { bankChargeToPayment } from "@/lib/caja/cargos";

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const CATEGORY_ID = "22222222-2222-4222-8222-222222222222";
const METHOD_ID = "33333333-3333-4333-8333-333333333333";

describe("bankChargeToPayment", () => {
  it("convierte el cargo en un recibo de egreso sin entidad ni asignaciones", () => {
    const payment = bankChargeToPayment({
      cashAccountId: ACCOUNT_ID,
      categoryId: CATEGORY_ID,
      methodId: METHOD_ID,
      amount: 12.5,
      chargeDate: "2026-10-14",
      reference: "operación 0012345",
      notes: "ITF del mes",
    });

    expect(payment).toEqual({
      entityId: undefined,
      direction: "EGRESO",
      paymentDate: "2026-10-14",
      amount: 12.5,
      methodId: METHOD_ID,
      cashAccountId: ACCOUNT_ID,
      categoryId: CATEGORY_ID,
      reference: "operación 0012345",
      notes: "ITF del mes",
      allocations: [],
      isCashMovement: true,
    });
  });

  it("deja referencia y notas opcionales sin definir", () => {
    const payment = bankChargeToPayment({
      cashAccountId: ACCOUNT_ID,
      categoryId: CATEGORY_ID,
      methodId: METHOD_ID,
      amount: 5,
      chargeDate: "2026-10-14",
      reference: undefined,
      notes: undefined,
    });

    expect(payment.reference).toBeUndefined();
    expect(payment.notes).toBeUndefined();
    expect(payment.allocations).toEqual([]);
    expect(payment.isCashMovement).toBe(true);
  });
});
