import { describe, expect, it } from "vitest";

import { cashMovementSchema } from "@/lib/schemas/cash-movement";

const validMovement = () => ({
  cashAccountId: "550e8400-e29b-41d4-a716-446655440000",
  direction: "EGRESO" as const,
  methodId: "550e8400-e29b-41d4-a716-446655440010",
  categoryId: "550e8400-e29b-41d4-a716-446655440011",
  amount: "25",
  movementDate: "2026-10-20",
  reference: "",
  notes: "",
});

describe("cashMovementSchema", () => {
  it("acepta un movimiento completo y coacciona el importe", () => {
    const result = cashMovementSchema.safeParse(validMovement());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(25);
    }
  });

  it("rechaza una fecha futura", () => {
    const result = cashMovementSchema.safeParse({
      ...validMovement(),
      movementDate: "2099-01-01",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.map((issue) => issue.path.join("."))
      ).toContain("movementDate");
    }
  });

  it("rechaza importes de cero o negativos", () => {
    expect(
      cashMovementSchema.safeParse({ ...validMovement(), amount: "0" }).success
    ).toBe(false);
    expect(
      cashMovementSchema.safeParse({ ...validMovement(), amount: "-5" }).success
    ).toBe(false);
  });

  it("exige método y categoría válidos", () => {
    const result = cashMovementSchema.safeParse({
      ...validMovement(),
      methodId: "",
      categoryId: "pasajes",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("methodId");
      expect(paths).toContain("categoryId");
    }
  });
});
