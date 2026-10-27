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

  it("rechaza una fecha de cierre futura", () => {
    const result = cashCloseSchema.safeParse({
      ...validClose(),
      periodEnd: "2099-01-01",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.map((issue) => issue.path.join("."))
      ).toContain("periodEnd");
    }
  });

  it("acepta el motivo de la diferencia y lo recorta", () => {
    const result = cashCloseSchema.safeParse({
      ...validClose(),
      differenceReason: "  Faltante por vuelto  ",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.differenceReason).toBe("Faltante por vuelto");
    }
  });

  it("acepta los nombres del acta y los recorta (SPEC 51)", () => {
    const result = cashCloseSchema.safeParse({
      ...validClose(),
      countedBy: "  Ana Ríos  ",
      verifiedBy: "Luis Torres",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.countedBy).toBe("Ana Ríos");
      expect(result.data.verifiedBy).toBe("Luis Torres");
    }
  });
});

describe("cashCloseSchema con arqueo por denominaciones", () => {
  const denominations = () => [
    { denomination: 100, quantity: "3" },
    { denomination: 50, quantity: "2" },
    { denomination: 0.5, quantity: "1" },
  ];

  it("acepta el detalle por denominación y lo convierte a números", () => {
    const result = cashCloseSchema.safeParse({
      ...validClose(),
      countedBalance: "",
      denominations: denominations(),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.denominations).toEqual([
        { denomination: 100, quantity: 3 },
        { denomination: 50, quantity: 2 },
        { denomination: 0.5, quantity: 1 },
      ]);
    }
  });

  it("trata la cantidad vacía como no contada", () => {
    const result = cashCloseSchema.safeParse({
      ...validClose(),
      denominations: [
        { denomination: 200, quantity: "" },
        { denomination: 100, quantity: 1 },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.denominations?.[0].quantity).toBeUndefined();
    }
  });

  it("rechaza una denominación fuera del arqueo", () => {
    const result = cashCloseSchema.safeParse({
      ...validClose(),
      denominations: [{ denomination: 25, quantity: 1 }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("denominations.0.denomination");
    }
  });

  it("rechaza cantidades negativas o con decimales", () => {
    const negative = cashCloseSchema.safeParse({
      ...validClose(),
      denominations: [{ denomination: 10, quantity: "-1" }],
    });
    const decimal = cashCloseSchema.safeParse({
      ...validClose(),
      denominations: [{ denomination: 10, quantity: "1.5" }],
    });

    expect(negative.success).toBe(false);
    expect(decimal.success).toBe(false);
  });

  it("rechaza una denominación repetida", () => {
    const result = cashCloseSchema.safeParse({
      ...validClose(),
      denominations: [
        { denomination: 10, quantity: 1 },
        { denomination: 10, quantity: 2 },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("denominations.1.denomination");
    }
  });

  it("mantiene la compatibilidad sin denominaciones (banco o cierre simple)", () => {
    const result = cashCloseSchema.safeParse(validClose());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.denominations).toBeUndefined();
      expect(result.data.countedBalance).toBe(1500);
    }
  });
});
