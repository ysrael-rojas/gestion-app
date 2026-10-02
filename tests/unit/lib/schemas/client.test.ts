import { describe, expect, it } from "vitest";
import { clientSchema } from "@/lib/schemas/client";

const validClient = () => ({
  documentType: "RUC" as const,
  documentNumber: "20512345678",
  name: "ACME S.A.",
  address: "Av. Industrial 123",
  phone: "+51 999 999 999",
  contactName: "Juan Pérez",
  billingEmail: "billing@acme.com",
  managementEmail: "ops@acme.com",
  isSupplier: false,
});

describe("clientSchema", () => {
  it("acepta un cliente RUC válido", () => {
    const result = clientSchema.safeParse(validClient());
    expect(result.success).toBe(true);
  });

  it("acepta un cliente DNI válido", () => {
    const result = clientSchema.safeParse({
      ...validClient(),
      documentType: "DNI",
      documentNumber: "12345678",
    });
    expect(result.success).toBe(true);
  });

  it("acepta un cliente SIN_DOCUMENTO sin validar el número", () => {
    const result = clientSchema.safeParse({
      ...validClient(),
      documentType: "SIN_DOCUMENTO",
      documentNumber: "",
    });
    expect(result.success).toBe(true);
  });

  it("rechaza RUC con menos de 11 dígitos", () => {
    const result = clientSchema.safeParse({
      ...validClient(),
      documentType: "RUC",
      documentNumber: "1234",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const docIssue = result.error.issues.find((i) => i.path[0] === "documentNumber");
      expect(docIssue?.message).toBe("Número de documento inválido");
    }
  });

  it("rechaza nombre vacío", () => {
    const result = clientSchema.safeParse({ ...validClient(), name: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const nameIssue = result.error.issues.find((i) => i.path[0] === "name");
      expect(nameIssue?.message).toBe("El nombre es requerido");
    }
  });

  it("rechaza billingEmail con formato inválido", () => {
    const result = clientSchema.safeParse({
      ...validClient(),
      billingEmail: "no-es-un-email",
    });
    expect(result.success).toBe(false);
  });

  it("rechaza managementEmail con formato inválido (no vacío)", () => {
    const result = clientSchema.safeParse({
      ...validClient(),
      managementEmail: "tampoco",
    });
    expect(result.success).toBe(false);
  });
});
