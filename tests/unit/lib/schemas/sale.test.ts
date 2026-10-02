import { describe, expect, it } from "vitest";
import { saleSchema } from "@/lib/schemas/sale";

const validSale = () => ({
  issueDate: "2026-10-01",
  voucherType: "FACTURA" as const,
  voucherNumber: "F001-000001",
  entityId: "e-1",
  total: 100,
  paymentType: "CONTADO" as const,
  creditDays: undefined as number | undefined,
  status: "PENDIENTE" as const,
});

describe("saleSchema", () => {
  it("acepta una venta al CONTADO válida", () => {
    const result = saleSchema.safeParse(validSale());
    expect(result.success).toBe(true);
  });

  it("acepta una venta a CRÉDITO con creditDays >= 1", () => {
    const result = saleSchema.safeParse({
      ...validSale(),
      paymentType: "CREDITO",
      creditDays: 30,
    });
    expect(result.success).toBe(true);
  });

  it("rechaza venta con total negativo o cero", () => {
    const result = saleSchema.safeParse({ ...validSale(), total: 0 });
    expect(result.success).toBe(false);
  });

  it("rechaza venta a CRÉDITO sin creditDays", () => {
    const result = saleSchema.safeParse({
      ...validSale(),
      paymentType: "CREDITO",
      creditDays: undefined,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const creditIssue = result.error.issues.find((i) => i.path[0] === "creditDays");
      expect(creditIssue?.message).toBe("Ingresa los días de crédito");
    }
  });

  it("rechaza venta sin issueDate", () => {
    const result = saleSchema.safeParse({ ...validSale(), issueDate: "" });
    expect(result.success).toBe(false);
  });

  it("rechaza voucherNumber vacío", () => {
    const result = saleSchema.safeParse({ ...validSale(), voucherNumber: "" });
    expect(result.success).toBe(false);
  });

  it("rechaza voucherType fuera del enum", () => {
    const result = saleSchema.safeParse({
      ...validSale(),
      voucherType: "RECIBO_HONORARIOS",
    });
    expect(result.success).toBe(false);
  });
});
