import { describe, expect, it } from "vitest";
import { notaSchema } from "@/lib/schemas/nota";

const validCreditNote = () => ({
  issueDate: "2026-10-17",
  voucherType: "NOTA_CREDITO" as const,
  voucherNumber: "FC01-000001",
  total: 118,
  motiveCode: "01",
  referencedComprobanteId: "c-1",
});

describe("notaSchema", () => {
  it("acepta una nota de crédito con motivo del catálogo", () => {
    expect(notaSchema.safeParse(validCreditNote()).success).toBe(true);
  });

  it("acepta una nota de débito con motivo del catálogo de débito", () => {
    const result = notaSchema.safeParse({
      ...validCreditNote(),
      voucherType: "NOTA_DEBITO",
      motiveCode: "03",
    });
    expect(result.success).toBe(true);
  });

  it("acepta un comprobante de retención sin motivo", () => {
    const result = notaSchema.safeParse({
      ...validCreditNote(),
      voucherType: "COMPROBANTE_RETENCION",
      motiveCode: undefined,
      voucherNumber: "R001-000001",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza una NC/ND sin motivo con mensaje en español", () => {
    const result = notaSchema.safeParse({
      ...validCreditNote(),
      motiveCode: undefined,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "motiveCode");
      expect(issue?.message).toBe("Selecciona el motivo de la nota");
    }
  });

  it("rechaza un motivo que no pertenece al catálogo del tipo", () => {
    // 08 (Bonificación) no está en el catálogo de NC de esta app.
    const result = notaSchema.safeParse({
      ...validCreditNote(),
      motiveCode: "08",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "motiveCode");
      expect(issue?.message).toBe("El motivo no pertenece al catálogo de la nota");
    }
  });

  it("rechaza un motivo de NC en una nota de débito", () => {
    const result = notaSchema.safeParse({
      ...validCreditNote(),
      voucherType: "NOTA_DEBITO",
      motiveCode: "09",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza una retención con motivo", () => {
    const result = notaSchema.safeParse({
      ...validCreditNote(),
      voucherType: "COMPROBANTE_RETENCION",
      motiveCode: "01",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "motiveCode");
      expect(issue?.message).toBe("El comprobante de retención no lleva motivo");
    }
  });

  it("rechaza una nota sin comprobante referenciado", () => {
    const result = notaSchema.safeParse({
      ...validCreditNote(),
      referencedComprobanteId: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find(
        (i) => i.path[0] === "referencedComprobanteId"
      );
      expect(issue?.message).toBe("Selecciona el comprobante referenciado");
    }
  });

  it("rechaza total cero o negativo", () => {
    expect(notaSchema.safeParse({ ...validCreditNote(), total: 0 }).success).toBe(
      false
    );
    expect(
      notaSchema.safeParse({ ...validCreditNote(), total: -5 }).success
    ).toBe(false);
  });

  it("rechaza un número que no calza el formato serie-correlativo", () => {
    const result = notaSchema.safeParse({
      ...validCreditNote(),
      voucherNumber: "nota uno",
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

  it("recorta espacios alrededor del número antes de validar", () => {
    const result = notaSchema.safeParse({
      ...validCreditNote(),
      voucherNumber: "  FC01-000002  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.voucherNumber).toBe("FC01-000002");
    }
  });

  it("rechaza un tipo base (FACTURA) en el esquema de notas", () => {
    const result = notaSchema.safeParse({
      ...validCreditNote(),
      voucherType: "FACTURA",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza fecha de emisión vacía", () => {
    const result = notaSchema.safeParse({ ...validCreditNote(), issueDate: "" });
    expect(result.success).toBe(false);
  });
});
