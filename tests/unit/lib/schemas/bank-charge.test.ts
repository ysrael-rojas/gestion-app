import { describe, expect, it } from "vitest";

import { bankChargeSchema } from "@/lib/schemas/bank-charge";

const validCharge = () => ({
  cashAccountId: "550e8400-e29b-41d4-a716-446655440000",
  categoryId: "550e8400-e29b-41d4-a716-446655440001",
  methodId: "550e8400-e29b-41d4-a716-446655440002",
  amount: "12.50",
  chargeDate: "2026-10-14",
  reference: "operación 0012345",
  notes: "ITF del mes",
});

describe("bankChargeSchema", () => {
  it("acepta un cargo bancario completo y convierte el importe", () => {
    const result = bankChargeSchema.safeParse(validCharge());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(12.5);
      expect(result.data.reference).toBe("operación 0012345");
    }
  });

  it("rechaza importes de cero o negativos", () => {
    expect(
      bankChargeSchema.safeParse({ ...validCharge(), amount: "0" }).success
    ).toBe(false);
    expect(
      bankChargeSchema.safeParse({ ...validCharge(), amount: "-5" }).success
    ).toBe(false);
  });

  it("exige cuenta, categoría y método válidos", () => {
    const result = bankChargeSchema.safeParse({
      ...validCharge(),
      cashAccountId: "",
      categoryId: "no-es-uuid",
      methodId: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("cashAccountId");
      expect(paths).toContain("categoryId");
      expect(paths).toContain("methodId");
    }
  });

  it("rechaza una fecha con formato inválido", () => {
    expect(
      bankChargeSchema.safeParse({ ...validCharge(), chargeDate: "14/10/2026" })
        .success
    ).toBe(false);
  });

  it("limita la referencia y las notas como el resto de recibos", () => {
    expect(
      bankChargeSchema.safeParse({
        ...validCharge(),
        reference: "x".repeat(61),
      }).success
    ).toBe(false);
    expect(
      bankChargeSchema.safeParse({ ...validCharge(), notes: "x".repeat(201) })
        .success
    ).toBe(false);
  });

  it("acepta el cargo sin referencia ni notas", () => {
    const result = bankChargeSchema.safeParse({
      ...validCharge(),
      reference: undefined,
      notes: undefined,
    });

    expect(result.success).toBe(true);
  });
});
