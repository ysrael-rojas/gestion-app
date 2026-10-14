import { describe, expect, it } from "vitest";

import { cashTransferSchema } from "@/lib/schemas/cash-transfer";

const validTransfer = () => ({
  sourceAccountId: "550e8400-e29b-41d4-a716-446655440000",
  targetAccountId: "550e8400-e29b-41d4-a716-446655440001",
  amount: 100,
  transferDate: "2026-10-14",
  notes: "de caja a banco",
});

describe("cashTransferSchema", () => {
  it("acepta una transferencia válida", () => {
    const result = cashTransferSchema.safeParse(validTransfer());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(100);
    }
  });

  it("acepta notas vacías (opcional)", () => {
    const result = cashTransferSchema.safeParse({
      ...validTransfer(),
      notes: "",
    });

    expect(result.success).toBe(true);
  });

  it("rechaza origen igual a destino", () => {
    const result = cashTransferSchema.safeParse({
      ...validTransfer(),
      targetAccountId: validTransfer().sourceAccountId,
    });

    expect(result.success).toBe(false);
  });

  it("rechaza monto cero", () => {
    const result = cashTransferSchema.safeParse({
      ...validTransfer(),
      amount: 0,
    });

    expect(result.success).toBe(false);
  });

  it("rechaza monto negativo", () => {
    const result = cashTransferSchema.safeParse({
      ...validTransfer(),
      amount: -50,
    });

    expect(result.success).toBe(false);
  });

  it("rechaza cuenta que no es UUID", () => {
    const result = cashTransferSchema.safeParse({
      ...validTransfer(),
      sourceAccountId: "no-es-uuid",
    });

    expect(result.success).toBe(false);
  });

  it("rechaza fecha con formato inválido", () => {
    const result = cashTransferSchema.safeParse({
      ...validTransfer(),
      transferDate: "14/10/2026",
    });

    expect(result.success).toBe(false);
  });

  it("rechaza notas con más de 200 caracteres", () => {
    const result = cashTransferSchema.safeParse({
      ...validTransfer(),
      notes: "a".repeat(201),
    });

    expect(result.success).toBe(false);
  });
});
