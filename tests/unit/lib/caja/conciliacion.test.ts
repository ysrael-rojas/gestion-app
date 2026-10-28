import { beforeEach, describe, expect, it, vi } from "vitest";

const { mock } = await vi.hoisted(async () => {
  const { createMockSupabase } = await import("@/tests/__mocks__/supabase");
  return { mock: createMockSupabase() };
});

vi.mock("@/lib/supabase/client", () => ({ supabase: mock.client }));

import {
  computeReconciliation,
  getReconciliation,
  ITEM_META,
  ITEM_SIGN,
  saveReconciliation,
  type ReconciliationItem,
} from "@/lib/caja/conciliacion";

const headerRow = (overrides: Record<string, unknown> = {}) => ({
  id: "rec-1",
  owner_id: "owner-1",
  cash_account_id: "acc-bank",
  period_start: "2026-10-01",
  period_end: "2026-10-31",
  statement_balance: 17955.3,
  books_balance: 18420,
  prepared_by: "Ana Ríos",
  reviewed_by: "Luis Paredes",
  notes: "Octubre",
  created_at: "2026-10-31T10:00:00Z",
  updated_at: "2026-10-31T10:00:00Z",
  ...overrides,
});

const itemRow = (overrides: Record<string, unknown> = {}) => ({
  id: "item-1",
  reconciliation_id: "rec-1",
  kind: "DEPOSITO_EN_TRANSITO",
  description: "Depósito 30/10",
  amount: 970,
  created_at: "2026-10-31T10:00:00Z",
  ...overrides,
});

const items: ReconciliationItem[] = [
  { kind: "DEPOSITO_EN_TRANSITO", description: "Depósito 30/10", amount: 970 },
  { kind: "PAGO_NO_DEBITADO", description: "Pago proveedor", amount: 640 },
  { kind: "CARGO_NO_REGISTRADO", description: "ITF", amount: 15.3 },
  { kind: "ABONO_NO_REGISTRADO", description: "Intereses", amount: 4.6 },
];

describe("computeReconciliation", () => {
  it("aplica los signos del formato oficial", () => {
    const result = computeReconciliation(17955.3, 18420, items);

    // 17,955.30 + 970 − 640 − 15.30 + 4.60 = 18,274.60.
    expect(result.reconciledBalance).toBe(18274.6);
    expect(result.difference).toBe(145.4);
    expect(result.isConciled).toBe(false);
  });

  it("marca conciliado cuando la diferencia es cero", () => {
    const result = computeReconciliation(1000, 1000, []);

    expect(result.reconciledBalance).toBe(1000);
    expect(result.difference).toBe(0);
    expect(result.isConciled).toBe(true);
  });

  it("no da por conciliado un céntimo de diferencia", () => {
    const result = computeReconciliation(1000, 1000.01, []);

    expect(result.difference).toBe(0.01);
    expect(result.isConciled).toBe(false);
  });

  it("suma por clase de partida sin importar el orden", () => {
    const result = computeReconciliation(0, 0, [
      ...items,
      { kind: "DEPOSITO_EN_TRANSITO", description: "Otro", amount: 30 },
    ]);

    expect(result.adjustedByKind.DEPOSITO_EN_TRANSITO).toBe(1000);
    expect(result.adjustedByKind.PAGO_NO_DEBITADO).toBe(640);
    expect(result.adjustedByKind.CARGO_NO_REGISTRADO).toBe(15.3);
    expect(result.adjustedByKind.ABONO_NO_REGISTRADO).toBe(4.6);
    expect(result.reconciledBalance).toBe(349.3);
  });

  it("redondea los acumulados a dos decimales", () => {
    const result = computeReconciliation(0, 0, [
      { kind: "ABONO_NO_REGISTRADO", description: "A", amount: 0.1 },
      { kind: "ABONO_NO_REGISTRADO", description: "B", amount: 0.2 },
    ]);

    expect(result.adjustedByKind.ABONO_NO_REGISTRADO).toBe(0.3);
    expect(result.reconciledBalance).toBe(0.3);
  });

  it("acepta libros negativos (sobregiro)", () => {
    const result = computeReconciliation(0, -500, []);

    expect(result.difference).toBe(-500);
    expect(result.isConciled).toBe(false);
  });

  it("expone los signos y metadatos de las cuatro clases", () => {
    expect(ITEM_SIGN).toEqual({
      DEPOSITO_EN_TRANSITO: 1,
      PAGO_NO_DEBITADO: -1,
      CARGO_NO_REGISTRADO: -1,
      ABONO_NO_REGISTRADO: 1,
    });
    expect(ITEM_META.DEPOSITO_EN_TRANSITO.sign).toBe("+");
    expect(ITEM_META.CARGO_NO_REGISTRADO.sign).toBe("−");
    expect(ITEM_META.PAGO_NO_DEBITADO.hint).toMatch(/banco todavía no/);
  });
});

describe("getReconciliation", () => {
  beforeEach(() => {
    mock.reset();
  });

  it("devuelve null cuando no hay conciliación guardada", async () => {
    mock.setTable("bank_reconciliation", { data: [], error: null });

    const result = await getReconciliation(
      "acc-bank",
      "2026-10-01",
      "2026-10-31"
    );

    expect(result).toBeNull();
  });

  it("carga la cabecera y sus partidas", async () => {
    mock.setTable("bank_reconciliation", { data: [headerRow()], error: null });
    mock.setTable("bank_reconciliation_item", {
      data: [itemRow(), itemRow({ id: "item-2", kind: "PAGO_NO_DEBITADO", description: "Pago", amount: 640 })],
      error: null,
    });

    const result = await getReconciliation(
      "acc-bank",
      "2026-10-01",
      "2026-10-31"
    );

    expect(result).toMatchObject({
      id: "rec-1",
      accountId: "acc-bank",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      statementBalance: 17955.3,
      booksBalance: 18420,
      preparedBy: "Ana Ríos",
      reviewedBy: "Luis Paredes",
    });
    expect(result?.items).toHaveLength(2);
    expect(result?.items[1]).toMatchObject({
      kind: "PAGO_NO_DEBITADO",
      amount: 640,
    });
  });

  it("propaga el error de la base de datos", async () => {
    mock.setTable("bank_reconciliation", {
      data: null,
      error: { code: "42501", message: "permission denied" },
    });

    await expect(
      getReconciliation("acc-bank", "2026-10-01", "2026-10-31")
    ).rejects.toThrow(/permisos/);
  });
});

describe("saveReconciliation", () => {
  beforeEach(() => {
    mock.reset();
  });

  it("envía la cabecera y las partidas a la RPC atómica", async () => {
    mock.setRpc("save_bank_reconciliation", { data: "rec-1", error: null });
    mock.setTable("bank_reconciliation", { data: [headerRow()], error: null });
    mock.setTable("bank_reconciliation_item", {
      data: [itemRow()],
      error: null,
    });

    const saved = await saveReconciliation({
      accountId: "acc-bank",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      statementBalance: 17955.3,
      booksBalance: 18420,
      preparedBy: "Ana Ríos",
      reviewedBy: "Luis Paredes",
      notes: "Octubre",
      items,
    });

    expect(mock.rpcCalls).toHaveLength(1);
    expect(mock.rpcCalls[0].name).toBe("save_bank_reconciliation");
    expect(mock.rpcCalls[0].args).toMatchObject({
      p_reconciliation: {
        cash_account_id: "acc-bank",
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        statement_balance: 17955.3,
        books_balance: 18420,
        prepared_by: "Ana Ríos",
        reviewed_by: "Luis Paredes",
        notes: "Octubre",
      },
      p_items: [
        { kind: "DEPOSITO_EN_TRANSITO", description: "Depósito 30/10", amount: 970 },
        { kind: "PAGO_NO_DEBITADO", description: "Pago proveedor", amount: 640 },
        { kind: "CARGO_NO_REGISTRADO", description: "ITF", amount: 15.3 },
        { kind: "ABONO_NO_REGISTRADO", description: "Intereses", amount: 4.6 },
      ],
    });
    expect(saved.id).toBe("rec-1");
  });

  it("convierte la cabecera a snake_case con campos opcionales nulos", async () => {
    mock.setRpc("save_bank_reconciliation", { data: "rec-1", error: null });
    mock.setTable("bank_reconciliation", {
      data: [headerRow({ prepared_by: null, reviewed_by: null, notes: null })],
      error: null,
    });
    mock.setTable("bank_reconciliation_item", { data: [], error: null });

    await saveReconciliation({
      accountId: "acc-bank",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      statementBalance: 0,
      booksBalance: 0,
      items: [],
    });

    expect(mock.rpcCalls[0].args?.p_reconciliation).toMatchObject({
      prepared_by: null,
      reviewed_by: null,
      notes: null,
    });
    expect(mock.rpcCalls[0].args?.p_items).toEqual([]);
  });

  it("propaga el mensaje de validación de la RPC", async () => {
    mock.setRpc("save_bank_reconciliation", {
      data: null,
      error: {
        code: "P0001",
        message: "Solo se concilian cuentas bancarias",
      },
    });

    await expect(
      saveReconciliation({
        accountId: "acc-cash",
        periodStart: "2026-10-01",
        periodEnd: "2026-10-31",
        statementBalance: 0,
        booksBalance: 0,
        items: [],
      })
    ).rejects.toThrow("Solo se concilian cuentas bancarias");
  });

  it("falla si después de guardar no se puede releer", async () => {
    mock.setRpc("save_bank_reconciliation", { data: "rec-1", error: null });
    mock.setTable("bank_reconciliation", { data: [], error: null });

    await expect(
      saveReconciliation({
        accountId: "acc-bank",
        periodStart: "2026-10-01",
        periodEnd: "2026-10-31",
        statementBalance: 0,
        booksBalance: 0,
        items: [],
      })
    ).rejects.toThrow(/No se pudo guardar/);
  });
});
