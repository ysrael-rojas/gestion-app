import { beforeEach, describe, expect, it, vi } from "vitest";

const { mock } = await vi.hoisted(async () => {
  const { createMockSupabase } = await import("@/tests/__mocks__/supabase");
  return { mock: createMockSupabase() };
});

vi.mock("@/lib/supabase/client", () => ({ supabase: mock.client }));

import { closeCashAccount, proposeClosePeriod } from "@/lib/caja/caja";

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
});
