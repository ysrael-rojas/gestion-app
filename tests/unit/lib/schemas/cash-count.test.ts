import { describe, expect, it } from "vitest";

import { cashCountSchema } from "@/lib/schemas/cash-count";

const validCount = () => ({
  accountId: "550e8400-e29b-41d4-a716-446655440000",
  countDate: "2026-10-20",
  countedBy: "Ana Ríos",
  notes: "Sorpresivo",
  denominations: [{ denomination: 100, quantity: "2" }],
});

describe("cashCountSchema", () => {
  it("acepta un arqueo con denominaciones y las convierte a números", () => {
    const result = cashCountSchema.safeParse(validCount());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.denominations).toEqual([
        { denomination: 100, quantity: 2 },
      ]);
    }
  });

  it("rechaza una fecha futura", () => {
    const result = cashCountSchema.safeParse({
      ...validCount(),
      countDate: "2099-01-01",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.map((issue) => issue.path.join("."))
      ).toContain("countDate");
    }
  });

  it("acepta un saldo contado sin denominaciones (banco)", () => {
    const result = cashCountSchema.safeParse({
      ...validCount(),
      denominations: undefined,
      countedBalance: "1500",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.countedBalance).toBe(1500);
    }
  });

  it("rechaza un conteo negativo", () => {
    const result = cashCountSchema.safeParse({
      ...validCount(),
      denominations: undefined,
      countedBalance: "-5",
    });

    expect(result.success).toBe(false);
  });
});
