import { beforeEach, describe, expect, it, vi } from "vitest";

const { mock } = await vi.hoisted(async () => {
  const { createMockSupabase } = await import("@/tests/__mocks__/supabase");
  return { mock: createMockSupabase() };
});

vi.mock("@/lib/supabase/client", () => ({ supabase: mock.client }));

import {
  anularVale,
  createVale,
  listVales,
  pendingValesTotal,
  replenishPettyCash,
  type PettyCashVale,
} from "@/lib/caja/caja-chica";

const valeRow = (overrides: Record<string, unknown> = {}) => ({
  id: "vale-1",
  owner_id: "owner-1",
  account_id: "acc-1",
  serial: 1,
  vale_date: "2026-10-14",
  paid_to: "Juan Pérez",
  concept: "Pasajes",
  amount: 30,
  has_receipt: true,
  status: "PENDIENTE",
  created_at: "2026-10-14T00:00:00Z",
  ...overrides,
});

const vale = (overrides: Partial<PettyCashVale> = {}): PettyCashVale => ({
  id: "vale-1",
  accountId: "acc-1",
  serial: 1,
  valeDate: "2026-10-14",
  paidTo: "Juan Pérez",
  concept: "Pasajes",
  amount: 30,
  hasReceipt: true,
  status: "PENDIENTE",
  createdAt: "2026-10-14T00:00:00Z",
  ...overrides,
});

describe("caja-chica.ts", () => {
  beforeEach(() => {
    mock.reset();
  });

  describe("listVales", () => {
    it("mapea los vales de la cuenta", async () => {
      mock.setTable("petty_cash_vale", {
        data: [valeRow(), valeRow({ id: "vale-2", serial: 2, amount: 20 })],
        error: null,
      });

      const vales = await listVales("acc-1");

      expect(vales).toHaveLength(2);
      expect(vales[0]).toMatchObject({
        id: "vale-1",
        serial: 1,
        amount: 30,
        status: "PENDIENTE",
        hasReceipt: true,
        paidTo: "Juan Pérez",
      });
    });

    it("devuelve una lista vacía cuando la caja no tiene vales", async () => {
      mock.setTable("petty_cash_vale", { data: [], error: null });

      expect(await listVales("acc-1")).toEqual([]);
    });

    it("propaga el error de la base de datos", async () => {
      mock.setTable("petty_cash_vale", {
        data: null,
        error: { code: "42501", message: "permission denied" },
      });

      await expect(listVales("acc-1")).rejects.toThrow(/permisos/);
    });
  });

  describe("pendingValesTotal", () => {
    it("suma solo los vales pendientes", () => {
      const total = pendingValesTotal([
        vale({ amount: 30 }),
        vale({ id: "v-2", amount: 20, status: "REPUESTO" }),
        vale({ id: "v-3", amount: 10.5 }),
        vale({ id: "v-4", amount: 5, status: "ANULADO" }),
      ]);

      expect(total).toBe(40.5);
    });

    it("devuelve cero sin vales pendientes", () => {
      expect(pendingValesTotal([])).toBe(0);
      expect(pendingValesTotal([vale({ status: "REPUESTO" })])).toBe(0);
    });
  });

  describe("createVale", () => {
    it("llama a la RPC con los datos del vale y devuelve el vale creado", async () => {
      mock.setRpc("create_petty_cash_vale", { data: "vale-1", error: null });
      mock.setTable("petty_cash_vale", { data: [valeRow()], error: null });

      const created = await createVale({
        accountId: "acc-1",
        valeDate: "2026-10-14",
        paidTo: "Juan Pérez",
        concept: "Pasajes",
        amount: 30,
        hasReceipt: true,
      });

      expect(created.serial).toBe(1);
      expect(mock.rpcCalls[0]).toMatchObject({
        name: "create_petty_cash_vale",
        args: {
          p_account_id: "acc-1",
          p_vale_date: "2026-10-14",
          p_paid_to: "Juan Pérez",
          p_concept: "Pasajes",
          p_amount: 30,
          p_has_receipt: true,
        },
      });
    });

    it("propaga el mensaje de la RPC cuando el monto supera el límite", async () => {
      mock.setRpc("create_petty_cash_vale", {
        data: null,
        error: {
          code: "P0001",
          message: "El monto del vale (60.00) supera el límite por gasto de la caja chica (50.00)",
        },
      });

      await expect(
        createVale({
          accountId: "acc-1",
          valeDate: "2026-10-14",
          paidTo: "Juan Pérez",
          concept: "Pasajes",
          amount: 60,
          hasReceipt: false,
        })
      ).rejects.toThrow(/límite por gasto/);
    });
  });

  describe("anularVale", () => {
    it("llama a la RPC de anulación", async () => {
      mock.setRpc("void_petty_cash_vale", { data: null, error: null });

      await anularVale("vale-1");

      expect(mock.rpcCalls[0]).toEqual({
        name: "void_petty_cash_vale",
        args: { p_vale_id: "vale-1" },
      });
    });

    it("propaga el mensaje cuando el vale no está pendiente", async () => {
      mock.setRpc("void_petty_cash_vale", {
        data: null,
        error: {
          code: "P0001",
          message: "Solo se pueden anular vales pendientes",
        },
      });

      await expect(anularVale("vale-1")).rejects.toThrow(
        "Solo se pueden anular vales pendientes"
      );
    });
  });

  describe("replenishPettyCash", () => {
    it("devuelve el id de la transferencia creada", async () => {
      mock.setRpc("replenish_petty_cash", { data: "transfer-1", error: null });

      const transferId = await replenishPettyCash({
        accountId: "acc-1",
        sourceAccountId: "acc-2",
        valeIds: ["vale-1", "vale-2"],
      });

      expect(transferId).toBe("transfer-1");
      expect(mock.rpcCalls[0]).toMatchObject({
        name: "replenish_petty_cash",
        args: {
          p_account_id: "acc-1",
          p_source_account_id: "acc-2",
          p_vale_ids: ["vale-1", "vale-2"],
        },
      });
    });

    it("propaga el error de la RPC", async () => {
      mock.setRpc("replenish_petty_cash", {
        data: null,
        error: {
          code: "P0001",
          message: "Algún vale no existe, no pertenece a la caja chica o no está pendiente",
        },
      });

      await expect(
        replenishPettyCash({
          accountId: "acc-1",
          sourceAccountId: "acc-2",
          valeIds: ["vale-1"],
        })
      ).rejects.toThrow(/no pertenece a la caja chica/);
    });
  });
});
