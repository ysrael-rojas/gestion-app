import { describe, expect, it } from "vitest";
import { paymentSchema } from "@/lib/schemas/payment";

const validPayment = () => ({
  entityId: "550e8400-e29b-41d4-a716-446655440000",
  direction: "INGRESO" as const,
  paymentDate: "2026-10-01",
  amount: 100,
  method: "EFECTIVO" as const,
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

  it("rechaza método fuera del enum", () => {
    const result = paymentSchema.safeParse({
      ...validPayment(),
      method: "YAPE",
    });
    expect(result.success).toBe(false);
  });
});
