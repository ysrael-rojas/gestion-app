import { describe, expect, it } from "vitest";
import { paymentSchema } from "@/lib/schemas/payment";

const validPayment = () => ({
  entityId: "550e8400-e29b-41d4-a716-446655440000",
  direction: "INGRESO" as const,
  paymentDate: "2026-10-01",
  amount: 100,
  methodId: "550e8400-e29b-41d4-a716-446655440010",
  cashAccountId: "550e8400-e29b-41d4-a716-446655440011",
  categoryId: "550e8400-e29b-41d4-a716-446655440012",
  reference: "OP-123",
  notes: "Pago inicial",
  allocations: [{ comprobanteId: "550e8400-e29b-41d4-a716-446655440000", amount: 100 }],
});

describe("paymentSchema", () => {
  it("acepta un pago con allocations dentro del monto", () => {
    const result = paymentSchema.safeParse(validPayment());
    expect(result.success).toBe(true);
  });

  it("acepta un pago sin allocations (default vacío)", () => {
    const result = paymentSchema.safeParse({
      ...validPayment(),
      allocations: undefined,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.allocations).toEqual([]);
    }
  });

  it("acepta un anticipo sin entidad y sin allocations", () => {
    const { entityId, ...rest } = validPayment();
    void entityId;
    const result = paymentSchema.safeParse({
      ...rest,
      allocations: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entityId).toBeUndefined();
    }
  });

  it("rechaza allocations cuando falta la entidad", () => {
    const { entityId, ...rest } = validPayment();
    void entityId;
    const result = paymentSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const entityIssue = result.error.issues.find((i) => i.path[0] === "entityId");
      expect(entityIssue?.message).toBe("Selecciona la entidad para asignar el pago.");
    }
  });

  it("rechaza monto 0 o negativo", () => {
    const result = paymentSchema.safeParse({ ...validPayment(), amount: 0 });
    expect(result.success).toBe(false);
  });

  it("rechaza allocations que suman más que el monto del pago", () => {
    const result = paymentSchema.safeParse({
      ...validPayment(),
      amount: 50,
      allocations: [
        { comprobanteId: "550e8400-e29b-41d4-a716-446655440000", amount: 30 },
        { comprobanteId: "550e8400-e29b-41d4-a716-446655440001", amount: 30 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const allocIssue = result.error.issues.find((i) => i.path[0] === "allocations");
      expect(allocIssue?.message).toBe(
        "Las asignaciones no pueden superar el importe del pago.",
      );
    }
  });

  it("rechaza comprobanteId que no es UUID", () => {
    const result = paymentSchema.safeParse({
      ...validPayment(),
      allocations: [{ comprobanteId: "no-es-uuid", amount: 50 }],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza dirección fuera del enum", () => {
    const result = paymentSchema.safeParse({
      ...validPayment(),
      direction: "TRANSFERENCIA",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza methodId que no es UUID", () => {
    const result = paymentSchema.safeParse({
      ...validPayment(),
      methodId: "YAPE",
    });
    expect(result.success).toBe(false);
  });

  it("exige cuenta y categoría", () => {
    const { cashAccountId, categoryId, ...rest } = validPayment();
    void cashAccountId;
    void categoryId;
    expect(paymentSchema.safeParse(rest).success).toBe(false);
  });
});
