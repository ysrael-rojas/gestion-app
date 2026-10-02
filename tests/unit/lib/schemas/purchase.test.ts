import { describe, expect, it } from "vitest";
import { purchaseSchema } from "@/lib/schemas/purchase";

const validPurchase = () => ({
  issueDate: "2026-10-01",
  voucherType: "FACTURA" as const,
  voucherNumber: "F001-000001",
  supplierId: "sup-1",
  total: 100,
  paymentType: "CONTADO" as const,
  creditDays: undefined as number | undefined,
  status: "PENDIENTE" as const,
});

describe("purchaseSchema", () => {
  it("acepta una compra al CONTADO válida", () => {
    const result = purchaseSchema.safeParse(validPurchase());
    expect(result.success).toBe(true);
  });

  it("acepta una compra a CRÉDITO con creditDays >= 1", () => {
    const result = purchaseSchema.safeParse({
      ...validPurchase(),
      paymentType: "CREDITO",
      creditDays: 15,
    });
    expect(result.success).toBe(true);
  });

  it("rechaza compra con total negativo", () => {
    const result = purchaseSchema.safeParse({ ...validPurchase(), total: -10 });
    expect(result.success).toBe(false);
  });

  it("rechaza compra a CRÉDITO sin creditDays", () => {
    const result = purchaseSchema.safeParse({
      ...validPurchase(),
      paymentType: "CREDITO",
      creditDays: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const creditIssue = result.error.issues.find((i) => i.path[0] === "creditDays");
      expect(creditIssue?.message).toBe("Ingresa los días de crédito");
    }
  });

  it("rechaza supplierId vacío", () => {
    const result = purchaseSchema.safeParse({ ...validPurchase(), supplierId: "" });
    expect(result.success).toBe(false);
  });

  it("rechaza paymentType fuera del enum", () => {
    const result = purchaseSchema.safeParse({
      ...validPurchase(),
      paymentType: "LETRA",
    });
    expect(result.success).toBe(false);
  });
});
