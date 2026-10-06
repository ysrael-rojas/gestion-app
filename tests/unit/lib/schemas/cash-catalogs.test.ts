import { describe, expect, it } from "vitest";

import { paymentMethodSchema } from "@/lib/schemas/payment-method";
import { cashReceiptCategorySchema } from "@/lib/schemas/cash-receipt-category";

describe("paymentMethodSchema", () => {
  it("normaliza el código a mayúsculas y reemplaza espacios", () => {
    const result = paymentMethodSchema.safeParse({
      code: "tarjeta credito",
      name: "Tarjeta de crédito",
      isActive: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("TARJETA_CREDITO");
    }
  });

  it("exige nombre", () => {
    const result = paymentMethodSchema.safeParse({
      code: "EFECTIVO",
      name: "   ",
      isActive: true,
    });

    expect(result.success).toBe(false);
  });
});

describe("cashReceiptCategorySchema", () => {
  it("acepta una categoría de ingreso", () => {
    const result = cashReceiptCategorySchema.safeParse({
      direction: "INGRESO",
      name: "Cobranza de venta",
      isActive: true,
    });

    expect(result.success).toBe(true);
  });

  it("rechaza dirección fuera del enum", () => {
    const result = cashReceiptCategorySchema.safeParse({
      direction: "OTRO",
      name: "X",
      isActive: true,
    });

    expect(result.success).toBe(false);
  });

  it("exige nombre no vacío", () => {
    const result = cashReceiptCategorySchema.safeParse({
      direction: "EGRESO",
      name: "  ",
      isActive: true,
    });

    expect(result.success).toBe(false);
  });
});
