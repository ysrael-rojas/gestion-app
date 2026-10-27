import { beforeEach, describe, expect, it, vi } from "vitest";

const { mock } = await vi.hoisted(async () => {
  const { createMockSupabase } = await import("@/tests/__mocks__/supabase");
  return { mock: createMockSupabase() };
});

vi.mock("@/lib/supabase/client", () => ({ supabase: mock.client }));

import {
  createCashCount,
  getCashCount,
  listCashCounts,
} from "@/lib/caja/arqueos";

const countRow = (overrides: Record<string, unknown> = {}) => ({
  id: "count-1",
  owner_id: "owner-1",
  cash_account_id: "acc-1",
  count_date: "2026-10-20",
  counted_balance: 400,
  expected_balance: 500,
  difference: -100,
  change_fund: 100,
  counted_by: "Ana Ríos",
  is_surprise: true,
  notes: null,
  created_at: "2026-10-20T10:00:00Z",
  ...overrides,
});

describe("arqueos.ts", () => {
  beforeEach(() => {
    mock.reset();
  });

  describe("listCashCounts", () => {
    it("mapea los arqueos de la cuenta", async () => {
      mock.setTable("cash_count", { data: [countRow()], error: null });

      const counts = await listCashCounts("acc-1");

      expect(counts).toHaveLength(1);
      expect(counts[0]).toMatchObject({
        id: "count-1",
        accountId: "acc-1",
        countedBalance: 400,
        expectedBalance: 500,
        difference: -100,
        countedBy: "Ana Ríos",
      });
    });

    it("propaga el error de la base de datos", async () => {
      mock.setTable("cash_count", {
        data: null,
        error: { code: "42501", message: "permission denied" },
      });

      await expect(listCashCounts("acc-1")).rejects.toThrow(/permisos/);
    });
  });

  describe("getCashCount", () => {
    it("devuelve el arqueo mapeado", async () => {
      mock.setTable("cash_count", { data: [countRow()], error: null });

      const count = await getCashCount("count-1");

      expect(count.changeFund).toBe(100);
      expect(count.isSurprise).toBe(true);
    });
  });

  describe("createCashCount", () => {
    it("envía el conteo por denominaciones y devuelve el arqueo creado", async () => {
      mock.setRpc("register_cash_count", { data: "count-1", error: null });
      mock.setTable("cash_count", { data: [countRow()], error: null });

      const created = await createCashCount({
        accountId: "acc-1",
        countDate: "2026-10-20",
        countedBalance: undefined,
        countedBy: "Ana Ríos",
        notes: "Sorpresivo",
        denominations: [
          { denomination: 200, quantity: 2 },
          { denomination: 50, quantity: undefined },
        ],
      });

      expect(created.id).toBe("count-1");
      expect(mock.rpcCalls[0]).toMatchObject({
        name: "register_cash_count",
        args: {
          p_cash_account_id: "acc-1",
          p_count_date: "2026-10-20",
          p_counted_balance: 400,
          p_denominations: [{ denomination: 200, quantity: 2 }],
          p_counted_by: "Ana Ríos",
          p_notes: "Sorpresivo",
        },
      });
    });

    it("envía el saldo contado cuando no hay denominaciones (banco)", async () => {
      mock.setRpc("register_cash_count", { data: "count-1", error: null });
      mock.setTable("cash_count", { data: [countRow()], error: null });

      await createCashCount({
        accountId: "acc-1",
        countDate: "2026-10-20",
        countedBalance: 1500,
        countedBy: "",
        notes: "",
        denominations: undefined,
      });

      expect(mock.rpcCalls[0]).toMatchObject({
        args: { p_counted_balance: 1500, p_denominations: null },
      });
    });

    it("propaga el mensaje de la RPC (fecha cerrada o futura)", async () => {
      mock.setRpc("register_cash_count", {
        data: null,
        error: {
          code: "P0001",
          message: "La fecha del arqueo no puede ser futura (2026-12-01)",
        },
      });

      await expect(
        createCashCount({
          accountId: "acc-1",
          countDate: "2026-12-01",
          countedBalance: 10,
          countedBy: "",
          notes: "",
          denominations: undefined,
        })
      ).rejects.toThrow(/no puede ser futura/);
    });
  });
});
