import { describe, expect, it } from "vitest";

import {
  reconciliationFormSchema,
  reconciliationItemSchema,
} from "@/lib/schemas/reconciliation";

describe("reconciliationItemSchema", () => {
  it("acepta una partida válida y convierte el monto", () => {
    const result = reconciliationItemSchema.safeParse({
      kind: "DEPOSITO_EN_TRANSITO",
      description: "  Depósito 30/10  ",
      amount: "970.50",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        kind: "DEPOSITO_EN_TRANSITO",
        description: "Depósito 30/10",
        amount: 970.5,
      });
    }
  });

  it("rechaza un monto en cero", () => {
    const result = reconciliationItemSchema.safeParse({
      kind: "CARGO_NO_REGISTRADO",
      description: "ITF",
      amount: 0,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toContain(
        "amount"
      );
    }
  });

  it("exige la descripción", () => {
    const result = reconciliationItemSchema.safeParse({
      kind: "ABONO_NO_REGISTRADO",
      description: "   ",
      amount: 4.6,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.map((issue) => issue.path.join("."))
      ).toContain("description");
    }
  });

  it("rechaza una clase desconocida", () => {
    const result = reconciliationItemSchema.safeParse({
      kind: "AJUSTE",
      description: "X",
      amount: 1,
    });

    expect(result.success).toBe(false);
  });
});

describe("reconciliationFormSchema", () => {
  it("acepta un formulario vacío con saldo cero", () => {
    const result = reconciliationFormSchema.safeParse({
      statementBalance: "0",
      items: [],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.statementBalance).toBe(0);
      expect(result.data.items).toEqual([]);
    }
  });

  it("rechaza un extracto negativo", () => {
    const result = reconciliationFormSchema.safeParse({
      statementBalance: -1,
      items: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.map((issue) => issue.path.join("."))
      ).toContain("statementBalance");
    }
  });

  it("limita el largo de las firmas y las notas", () => {
    const result = reconciliationFormSchema.safeParse({
      statementBalance: 100,
      preparedBy: "a".repeat(101),
      reviewedBy: "b".repeat(101),
      notes: "c".repeat(501),
      items: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("preparedBy");
      expect(paths).toContain("reviewedBy");
      expect(paths).toContain("notes");
    }
  });

  it("acepta partidas con código y monto", () => {
    const result = reconciliationFormSchema.safeParse({
      statementBalance: 1000,
      preparedBy: "Ana Ríos",
      reviewedBy: "",
      notes: "",
      items: [
        { kind: "PAGO_NO_DEBITADO", description: "Pago", amount: "30" },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.items).toHaveLength(1);
      expect(result.data.items[0].amount).toBe(30);
      expect(result.data.preparedBy).toBe("Ana Ríos");
      expect(result.data.reviewedBy).toBe("");
    }
  });
});
