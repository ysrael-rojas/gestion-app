import { describe, expect, it } from "vitest";

import {
  createPettyCashValeSchema,
  pettyCashReplenishSchema,
  pettyCashValeSchema,
} from "@/lib/schemas/petty-cash-vale";

const ACCOUNT_ID = "550e8400-e29b-41d4-a716-446655440000";
const OTHER_ACCOUNT_ID = "550e8400-e29b-41d4-a716-446655440001";

const CATEGORY_ID = "550e8400-e29b-41d4-a716-446655440002";

const validVale = () => ({
  accountId: ACCOUNT_ID,
  categoryId: CATEGORY_ID,
  valeDate: "2026-10-14",
  paidTo: "Juan Pérez",
  concept: "Pasajes",
  amount: "30",
  hasReceipt: true,
});

describe("pettyCashValeSchema", () => {
  it("acepta un vale completo", () => {
    const result = pettyCashValeSchema.safeParse(validVale());

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(30);
      expect(result.data.paidTo).toBe("Juan Pérez");
      expect(result.data.hasReceipt).toBe(true);
    }
  });

  it("rechaza un monto de cero o negativo", () => {
    expect(
      pettyCashValeSchema.safeParse({ ...validVale(), amount: "0" }).success
    ).toBe(false);
    expect(
      pettyCashValeSchema.safeParse({ ...validVale(), amount: "-10" }).success
    ).toBe(false);
  });

  it("exige pagado a y concepto", () => {
    const result = pettyCashValeSchema.safeParse({
      ...validVale(),
      paidTo: "   ",
      concept: "",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("paidTo");
      expect(paths).toContain("concept");
    }
  });

  it("exige la categoría del gasto (el vale genera un egreso)", () => {
    const missing = pettyCashValeSchema.safeParse({
      ...validVale(),
      categoryId: "",
    });
    const invalid = pettyCashValeSchema.safeParse({
      ...validVale(),
      categoryId: "pasajes",
    });

    expect(missing.success).toBe(false);
    expect(invalid.success).toBe(false);
    if (!missing.success) {
      expect(missing.error.issues.map((issue) => issue.path.join("."))).toContain(
        "categoryId"
      );
    }
  });

  it("rechaza una cuenta que no es UUID y una fecha inválida", () => {
    expect(
      pettyCashValeSchema.safeParse({ ...validVale(), accountId: "caja" }).success
    ).toBe(false);
    expect(
      pettyCashValeSchema.safeParse({ ...validVale(), valeDate: "14/10/2026" })
        .success
    ).toBe(false);
  });

  it("toma hasReceipt como false por defecto", () => {
    const result = pettyCashValeSchema.safeParse({
      ...validVale(),
      hasReceipt: undefined,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hasReceipt).toBe(false);
    }
  });
});

describe("createPettyCashValeSchema", () => {
  it("rechaza un vale que supera el límite por gasto", () => {
    const result = createPettyCashValeSchema(50).safeParse({
      ...validVale(),
      amount: "60",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("amount");
    }
  });

  it("acepta un vale igual o menor al límite", () => {
    expect(
      createPettyCashValeSchema(50).safeParse({ ...validVale(), amount: 50 })
        .success
    ).toBe(true);
    expect(
      createPettyCashValeSchema(50).safeParse({ ...validVale(), amount: 49.99 })
        .success
    ).toBe(true);
  });

  it("no aplica límite cuando la caja no lo tiene definido", () => {
    expect(
      createPettyCashValeSchema(null).safeParse({ ...validVale(), amount: 999 })
        .success
    ).toBe(true);
    expect(
      createPettyCashValeSchema(undefined).safeParse({
        ...validVale(),
        amount: 999,
      }).success
    ).toBe(true);
  });
});

describe("pettyCashReplenishSchema", () => {
  const valeIds = [ACCOUNT_ID, OTHER_ACCOUNT_ID];

  it("acepta una reposición con source distinto y al menos un vale", () => {
    const result = pettyCashReplenishSchema.safeParse({
      accountId: ACCOUNT_ID,
      sourceAccountId: OTHER_ACCOUNT_ID,
      valeIds,
    });

    expect(result.success).toBe(true);
  });

  it("exige al menos un vale", () => {
    const result = pettyCashReplenishSchema.safeParse({
      accountId: ACCOUNT_ID,
      sourceAccountId: OTHER_ACCOUNT_ID,
      valeIds: [],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("valeIds");
    }
  });

  it("rechaza que la cuenta de origen sea la misma caja chica", () => {
    const result = pettyCashReplenishSchema.safeParse({
      accountId: ACCOUNT_ID,
      sourceAccountId: ACCOUNT_ID,
      valeIds,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("sourceAccountId");
    }
  });
});
