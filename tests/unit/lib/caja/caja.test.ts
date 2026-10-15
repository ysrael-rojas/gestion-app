import { beforeEach, describe, expect, it, vi } from "vitest";

const { mock } = await vi.hoisted(async () => {
  const { createMockSupabase } = await import("@/tests/__mocks__/supabase");
  return { mock: createMockSupabase() };
});

vi.mock("@/lib/supabase/client", () => ({ supabase: mock.client }));

import {
  closeCashAccount,
  ensureCatalogsSeeded,
  getLastClose,
  listCashPositionsConsolidated,
  listCloseDenominations,
  proposeClosePeriod,
} from "@/lib/caja/caja";
import { DEFAULT_CATEGORIES } from "@/lib/caja/defaults";

const accountRow = (overrides: Record<string, unknown> = {}) => ({
  id: "acc-1",
  type: "CASH_BOX",
  name: "Caja principal",
  currency: "PEN",
  bank_name: null,
  account_number: null,
  cci: null,
  closing_periodicity: null,
  opening_balance: 0,
  opening_balance_date: "2026-09-01",
  notes: null,
  is_active: true,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  deleted_at: null,
  owner_id: "o-1",
  ...overrides,
});

const closeRow = (overrides: Record<string, unknown> = {}) => ({
  id: "close-1",
  owner_id: "o-1",
  cash_account_id: "acc-1",
  periodicity: "DAILY",
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  opening_balance: 0,
  income_total: 100,
  expense_total: 0,
  expected_balance: 100,
  counted_balance: 100,
  difference: 0,
  pen_usd_rate: null,
  notes: null,
  created_at: "2026-09-01T00:00:00Z",
  ...overrides,
});

describe("caja.ts", () => {
  beforeEach(() => {
    mock.reset();
  });

  describe("proposeClosePeriod", () => {
    it("usa la fecha de apertura si no hay cierres previos (periodicidad global DAILY)", async () => {
      mock.setTable("cash_account", { data: [accountRow()], error: null });
      // cash_close vacío → getLastClose devuelve null.
      // app_setting vacío → periodicidad predeterminada DAILY.

      const period = await proposeClosePeriod("acc-1", "2026-10-06");

      expect(period.periodStart).toBe("2026-09-01");
      expect(period.periodEnd).toBe("2026-10-05");
    });

    it("continúa desde el último cierre y respeta la periodicidad de la cuenta", async () => {
      mock.setTable("cash_account", {
        data: [accountRow({ closing_periodicity: "MONTHLY" })],
        error: null,
      });
      mock.setTable("cash_close", {
        data: [closeRow({ period_end: "2026-08-31" })],
        error: null,
      });

      const period = await proposeClosePeriod("acc-1", "2026-10-06");

      expect(period.periodStart).toBe("2026-09-01");
      expect(period.periodEnd).toBe("2026-09-30");
    });

    it("no propone un período anterior al inicio del período pendiente", async () => {
      mock.setTable("cash_account", { data: [accountRow()], error: null });
      mock.setTable("cash_close", {
        data: [closeRow({ period_end: "2026-10-05" })],
        error: null,
      });

      const period = await proposeClosePeriod("acc-1", "2026-10-06");

      expect(period.periodStart).toBe("2026-10-06");
      expect(period.periodEnd).toBe("2026-10-06");
    });

    it("lanza error si la cuenta no existe", async () => {
      mock.setTable("cash_account", { data: [], error: null });

      await expect(proposeClosePeriod("acc-1", "2026-10-06")).rejects.toThrow(
        "La cuenta no existe."
      );
    });
  });

  describe("getLastClose", () => {
    it("devuelve el cierre más reciente cuando la cuenta tiene varios cierres", async () => {
      // La query real ordena por period_end desc; el mock devuelve la primera
      // fila del arreglo, que es el cierre más reciente.
      const newest = closeRow({ id: "close-new", period_end: "2026-10-09" });
      const older = closeRow({ id: "close-old", period_end: "2026-10-05" });
      mock.setTable("cash_close", { data: [newest, older], error: null });

      const result = await getLastClose("acc-1");

      expect(result?.id).toBe("close-new");
      expect(result?.periodEnd).toBe("2026-10-09");
    });

    it("devuelve null cuando la cuenta no tiene cierres", async () => {
      mock.setTable("cash_close", { data: [], error: null });

      const result = await getLastClose("acc-1");

      expect(result).toBeNull();
    });
  });

  describe("ensureCatalogsSeeded", () => {
    it("siembra solo las categorías que faltan, incluidas las de cargo bancario", async () => {
      mock.setTable("payment_method", {
        data: [{ code: "EFECTIVO" }],
        error: null,
      });
      mock.setTable("cash_receipt_category", {
        data: [
          { direction: "EGRESO", name: "Pago a proveedor", code: "PAGO_PROVEEDOR" },
          { direction: "INGRESO", name: "Cobranza de venta", code: "COBRANZA_VENTA" },
        ],
        error: null,
      });

      await ensureCatalogsSeeded();

      const inserts = mock.insertCalls.map((call) => call.table);
      expect(inserts).toEqual(["payment_method", "cash_receipt_category"]);

      const methodPayload = mock.insertCalls[0].payload as { code: string }[];
      expect(methodPayload.map((row) => row.code)).toEqual([
        "TRANSFERENCIA_BCP",
        "TARJETA_CREDITO",
      ]);

      const categoryPayload = mock.insertCalls[1].payload as {
        direction: string;
        name: string;
      }[];
      const names = categoryPayload.map((row) => row.name);
      // Ya existía "Pago a proveedor": no se vuelve a insertar.
      expect(names).not.toContain("Pago a proveedor");
      expect(names).not.toContain("Cobranza de venta");
      // Las de cargo bancario sí, junto con el resto de egresos.
      expect(names).toEqual(
        expect.arrayContaining([
          "ITF",
          "Comisión bancaria",
          "Detracción SPOT",
        ])
      );
      // Faltan todas menos las dos que ya existían.
      const expectedMissing =
        DEFAULT_CATEGORIES.EGRESO.length -
        1 +
        (DEFAULT_CATEGORIES.INGRESO.length - 1);
      expect(categoryPayload).toHaveLength(expectedMissing);
    });

    it("no inserta nada cuando el catálogo ya está completo", async () => {
      mock.setTable("payment_method", {
        data: [
          { code: "EFECTIVO" },
          { code: "TRANSFERENCIA_BCP" },
          { code: "TARJETA_CREDITO" },
        ],
        error: null,
      });
      mock.setTable("cash_receipt_category", {
        data: [
          ...DEFAULT_CATEGORIES.EGRESO.map(({ code, name }) => ({
            direction: "EGRESO",
            name,
            code,
          })),
          ...DEFAULT_CATEGORIES.INGRESO.map(({ code, name }) => ({
            direction: "INGRESO",
            name,
            code,
          })),
        ],
        error: null,
      });

      await ensureCatalogsSeeded();

      expect(mock.insertCalls).toEqual([]);
    });
  });

  describe("closeCashAccount", () => {
    it("llama a la RPC y devuelve el cierre creado", async () => {
      mock.setRpc("close_cash_account", { data: "close-1", error: null });
      mock.setTable("cash_close", { data: [closeRow()], error: null });

      const close = await closeCashAccount({
        cashAccountId: "acc-1",
        periodEnd: "2026-08-31",
        countedBalance: 100,
        notes: "",
      });

      expect(close.id).toBe("close-1");
      expect(close.expectedBalance).toBe(100);
    });

    it("propaga el mensaje de la RPC cuando el período ya está cerrado", async () => {
      mock.setRpc("close_cash_account", {
        data: null,
        error: {
          code: "P0001",
          message: "El período ya está cerrado hasta 2026-10-05",
        },
      });

      await expect(
        closeCashAccount({
          cashAccountId: "acc-1",
          periodEnd: "2026-10-01",
          countedBalance: undefined,
          notes: "",
        })
      ).rejects.toThrow("El período ya está cerrado hasta 2026-10-05");
    });
  });

  describe("closeCashAccount con arqueo por denominaciones", () => {
    it("envía el detalle contado y el total calculado como conteo físico", async () => {
      mock.setRpc("close_cash_account", { data: "close-1", error: null });
      mock.setTable("cash_close", { data: [closeRow()], error: null });

      await closeCashAccount({
        cashAccountId: "acc-1",
        periodEnd: "2026-10-14",
        countedBalance: undefined,
        notes: "",
        denominations: [
          { denomination: 100, quantity: 3 },
          { denomination: 50, quantity: 2 },
          { denomination: 200, quantity: undefined },
        ],
      });

      expect(mock.rpcCalls[0]).toMatchObject({
        name: "close_cash_account",
        args: {
          p_counted_balance: 400,
          p_denominations: [
            { denomination: 100, quantity: 3 },
            { denomination: 50, quantity: 2 },
          ],
        },
      });
    });

    it("no envía detalle cuando el conteo está vacío (banco o cierre simple)", async () => {
      mock.setRpc("close_cash_account", { data: "close-1", error: null });
      mock.setTable("cash_close", { data: [closeRow()], error: null });

      await closeCashAccount({
        cashAccountId: "acc-1",
        periodEnd: "2026-10-14",
        countedBalance: 1500,
        notes: "",
        denominations: [{ denomination: 100, quantity: undefined }],
      });

      expect(mock.rpcCalls[0]).toMatchObject({
        name: "close_cash_account",
        args: { p_counted_balance: 1500, p_denominations: null },
      });
    });
  });

  describe("listCloseDenominations", () => {
    it("devuelve el detalle del cierre con denominación y cantidad", async () => {
      mock.setTable("cash_close_denomination", {
        data: [
          {
            id: "den-1",
            cash_close_id: "close-1",
            denomination: 100,
            quantity: 3,
          },
          {
            id: "den-2",
            cash_close_id: "close-1",
            denomination: 0.5,
            quantity: 1,
          },
        ],
        error: null,
      });

      const rows = await listCloseDenominations("close-1");

      expect(rows).toEqual([
        { denomination: 100, quantity: 3 },
        { denomination: 0.5, quantity: 1 },
      ]);
    });

    it("devuelve una lista vacía cuando el cierre no tiene detalle", async () => {
      mock.setTable("cash_close_denomination", { data: [], error: null });

      expect(await listCloseDenominations("close-1")).toEqual([]);
    });
  });

  describe("listCashPositionsConsolidated", () => {
    it("resuelve todos los saldos con una sola RPC (sin N+1)", async () => {
      mock.setTable("cash_account", {
        data: [
          accountRow({ id: "acc-1", is_active: true }),
          accountRow({ id: "acc-2", is_active: true }),
        ],
        error: null,
      });
      mock.setRpc("get_cash_positions", {
        data: [
          { account_id: "acc-1", balance: 500 },
          { account_id: "acc-2", balance: 9320 },
        ],
        error: null,
      });

      const positions = await listCashPositionsConsolidated("2026-10-14");

      expect(positions).toHaveLength(2);
      expect(positions[0].balance).toBe(500);
      expect(positions[1].balance).toBe(9320);
      expect(mock.rpcCalls).toHaveLength(1);
      expect(mock.rpcCalls[0].name).toBe("get_cash_positions");
    });

    it("ignora cuentas inactivas y usa 0 si la RPC no devuelve saldo", async () => {
      mock.setTable("cash_account", {
        data: [
          accountRow({ id: "acc-1", is_active: true }),
          accountRow({ id: "acc-off", is_active: false }),
        ],
        error: null,
      });
      mock.setRpc("get_cash_positions", { data: [], error: null });

      const positions = await listCashPositionsConsolidated("2026-10-14");

      expect(positions).toHaveLength(1);
      expect(positions[0].account.id).toBe("acc-1");
      expect(positions[0].balance).toBe(0);
    });
  });
});
