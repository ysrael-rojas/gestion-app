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

  it("rechaza un número que no calza el formato serie-correlativo", () => {
    const result = purchaseSchema.safeParse({
      ...validPurchase(),
      voucherNumber: "factura uno",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path[0] === "voucherNumber"
      );
      expect(issue?.message).toBe(
        "Usa el formato serie-correlativo, por ejemplo F001-000001"
      );
    }
  });

  it("acepta series cortas, recorta espacios y rechaza correlativo no numérico", () => {
    expect(
      purchaseSchema.safeParse({ ...validPurchase(), voucherNumber: "B001-1" })
        .success
    ).toBe(true);

    const trimmed = purchaseSchema.safeParse({
      ...validPurchase(),
      voucherNumber: "  F001-000001  ",
    });
    expect(trimmed.success).toBe(true);
    if (trimmed.success) {
      expect(trimmed.data.voucherNumber).toBe("F001-000001");
    }

    expect(
      purchaseSchema.safeParse({ ...validPurchase(), voucherNumber: "F001-00A1" })
        .success
    ).toBe(false);
  });
});
