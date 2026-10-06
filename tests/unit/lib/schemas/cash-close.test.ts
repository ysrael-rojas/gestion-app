import { describe, expect, it } from "vitest";

import { cashCloseSchema } from "@/lib/schemas/cash-close";

const validClose = () => ({
  cashAccountId: "550e8400-e29b-41d4-a716-446655440000",
  periodEnd: "2026-10-05",
  countedBalance: "1500",
  notes: "cierre del día",
});

describe("cashCloseSchema", () => {
  it("acepta un cierre con conteo", () => {
    const result = cashCloseSchema.safeParse(validClose());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.countedBalance).toBe(1500);
    }
  });

  it("acepta conteo vacío como undefined (banco sin arqueo)", () => {
    const result = cashCloseSchema.safeParse({
      ...validClose(),
      countedBalance: "",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.countedBalance).toBeUndefined();
    }
  });

  it("rechaza fecha de cierre con formato inválido", () => {
    const result = cashCloseSchema.safeParse({
      ...validClose(),
      periodEnd: "05/10/2026",
    });

    expect(result.success).toBe(false);
  });

  it("rechaza cuenta que no es UUID", () => {
    const result = cashCloseSchema.safeParse({
      ...validClose(),
      cashAccountId: "no-es-uuid",
    });

    expect(result.success).toBe(false);
  });

  it("rechaza conteo negativo", () => {
    const result = cashCloseSchema.safeParse({
      ...validClose(),
      countedBalance: "-5",
    });

    expect(result.success).toBe(false);
  });
});
