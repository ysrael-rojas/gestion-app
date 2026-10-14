import { describe, expect, it } from "vitest";

import { cashAccountFormSchema, cashAccountTypeSchema } from "@/lib/schemas/cash-account";

const today = new Date().toISOString().slice(0, 10);

describe("cashAccountTypeSchema", () => {
  it("acepta CASH_BOX", () => {
    expect(cashAccountTypeSchema.parse("CASH_BOX")).toBe("CASH_BOX");
  });

  it("acepta BANK_ACCOUNT", () => {
    expect(cashAccountTypeSchema.parse("BANK_ACCOUNT")).toBe("BANK_ACCOUNT");
  });

  it("rechaza valores fuera del enum", () => {
    expect(() => cashAccountTypeSchema.parse("OTRO")).toThrow();
  });
});

describe("cashAccountFormSchema", () => {
  it("valida una caja en efectivo con valores mínimos", () => {
    const result = cashAccountFormSchema.parse({
      type: "CASH_BOX",
      name: "Caja Principal",
    });

    expect(result.type).toBe("CASH_BOX");
    expect(result.name).toBe("Caja Principal");
    expect(result.currency).toBe("PEN");
    expect(result.openingBalance).toBe(0);
    expect(result.openingBalanceDate).toBe(today);
    expect(result.isActive).toBe(true);
    expect(result.bankName).toBeUndefined();
    expect(result.accountNumber).toBeUndefined();
    expect(result.cci).toBeUndefined();
  });

  it("normaliza la moneda a uppercase", () => {
    const result = cashAccountFormSchema.parse({
      type: "CASH_BOX",
      name: "Caja Dólares",
      currency: "usd",
    });
    expect(result.currency).toBe("USD");
  });

  it("rechaza una caja con datos bancarios", () => {
    const result = cashAccountFormSchema.safeParse({
      type: "CASH_BOX",
      name: "Caja Test",
      bankName: "BCP",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("bankName");
    }
  });

  it("rechaza una cuenta bancaria sin banco", () => {
    const result = cashAccountFormSchema.safeParse({
      type: "BANK_ACCOUNT",
      name: "Cuenta BCP",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("bankName");
    }
  });

  it("acepta una cuenta bancaria con banco y número de cuenta válidos", () => {
    const result = cashAccountFormSchema.parse({
      type: "BANK_ACCOUNT",
      name: "Cuenta BCP Soles",
      bankName: "BCP",
      accountNumber: "123-456789-0-12",
      cci: "00212300456789012345",
      openingBalance: 1500,
    });

    expect(result.bankName).toBe("BCP");
    expect(result.accountNumber).toBe("123-456789-0-12");
    expect(result.cci).toBe("00212300456789012345");
    expect(result.openingBalance).toBe(1500);
  });

  it("rechaza CCI con longitud distinta de 20", () => {
    const result = cashAccountFormSchema.safeParse({
      type: "BANK_ACCOUNT",
      name: "Cuenta",
      bankName: "BCP",
      cci: "12345",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("cci");
    }
  });

  it("rechaza saldo inicial negativo", () => {
    const result = cashAccountFormSchema.safeParse({
      type: "CASH_BOX",
      name: "Caja",
      openingBalance: -1,
    });

    expect(result.success).toBe(false);
  });

  it("rechaza nombre vacío", () => {
    const result = cashAccountFormSchema.safeParse({
      type: "CASH_BOX",
      name: "   ",
    });

    expect(result.success).toBe(false);
  });
});

describe("cashAccountFormSchema — caja chica y fondo de cambio", () => {
  it("acepta una caja chica con fondo, límite y custodio", () => {
    const result = cashAccountFormSchema.parse({
      type: "CASH_BOX",
      name: "Caja chica administración",
      isPettyCash: true,
      changeFund: 300,
      pettyExpenseLimit: 50,
      custodianName: "  Ana Ríos  ",
    });

    expect(result.isPettyCash).toBe(true);
    expect(result.changeFund).toBe(300);
    expect(result.pettyExpenseLimit).toBe(50);
    expect(result.custodianName).toBe("Ana Ríos");
  });

  it("deja los campos de caja chica en sus valores por defecto", () => {
    const result = cashAccountFormSchema.parse({
      type: "CASH_BOX",
      name: "Caja principal",
    });

    expect(result.isPettyCash).toBe(false);
    expect(result.changeFund).toBe(0);
    expect(result.pettyExpenseLimit).toBeUndefined();
    expect(result.custodianName).toBeUndefined();
  });

  it("rechaza una caja chica sin fondo", () => {
    const result = cashAccountFormSchema.safeParse({
      type: "CASH_BOX",
      name: "Caja chica",
      isPettyCash: true,
      changeFund: 0,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("changeFund");
    }
  });

  it("rechaza fondo negativo", () => {
    const result = cashAccountFormSchema.safeParse({
      type: "CASH_BOX",
      name: "Caja",
      changeFund: -1,
    });

    expect(result.success).toBe(false);
  });

  it("rechaza límite por gasto que no sea mayor a cero", () => {
    const result = cashAccountFormSchema.safeParse({
      type: "CASH_BOX",
      name: "Caja chica",
      isPettyCash: true,
      changeFund: 100,
      pettyExpenseLimit: 0,
    });

    expect(result.success).toBe(false);
  });

  it("rechaza una caja chica en un banco", () => {
    const result = cashAccountFormSchema.safeParse({
      type: "BANK_ACCOUNT",
      name: "Cuenta BCP",
      bankName: "BCP",
      isPettyCash: true,
      changeFund: 500,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("isPettyCash");
      expect(paths).toContain("changeFund");
    }
  });
});