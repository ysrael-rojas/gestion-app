import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mock } = await vi.hoisted(async () => {
  const { createMockSupabase } = await import("@/tests/__mocks__/supabase");
  return { mock: createMockSupabase() };
});

vi.mock("@/lib/supabase/client", () => ({ supabase: mock.client }));

import { PettyCashPanel } from "@/components/cajas-bancos/petty-cash-panel";
import type { CashAccount } from "@/lib/cuentas/entidades";

const account = (overrides: Partial<CashAccount> = {}): CashAccount => ({
  id: "11111111-1111-4111-8111-111111111111",
  type: "CASH_BOX",
  name: "Caja chica administración",
  currency: "PEN",
  bankName: null,
  accountNumber: null,
  cci: null,
  closingPeriodicity: null,
  openingBalance: 300,
  openingBalanceDate: "2026-10-01",
  notes: null,
  isActive: true,
  isPettyCash: true,
  changeFund: 100,
  pettyExpenseLimit: 50,
  custodianName: "Ana Ríos",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  deletedAt: null,
  ...overrides,
});

const valeRow = (overrides: Record<string, unknown> = {}) => ({
  id: "vale-1",
  owner_id: "owner-1",
  account_id: "11111111-1111-4111-8111-111111111111",
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

const otherAccount = account({
  id: "22222222-2222-4222-8222-222222222222",
  type: "BANK_ACCOUNT",
  name: "Cuenta BCP",
  isPettyCash: false,
  changeFund: 0,
});

function renderPanel() {
  return render(
    <PettyCashPanel
      open
      onOpenChange={() => {}}
      account={account()}
      accounts={[account(), otherAccount]}
    />
  );
}

function summaryValue(label: string): HTMLElement {
  return screen.getByText(label).parentElement as HTMLElement;
}

describe("PettyCashPanel", () => {
  beforeEach(() => {
    mock.reset();
  });

  it("lista los vales con su estado", async () => {
    mock.setTable("petty_cash_vale", {
      data: [
        valeRow({ id: "33333333-3333-4333-8333-333333333333", serial: 1, amount: 30 }),
        valeRow({
          id: "44444444-4444-4444-8444-444444444444",
          serial: 2,
          amount: 20,
          paid_to: "Rosa Díaz",
          status: "REPUESTO",
        }),
        valeRow({
          id: "55555555-5555-4555-8555-555555555555",
          serial: 3,
          amount: 10,
          paid_to: "Luis Gómez",
          status: "ANULADO",
        }),
      ],
      error: null,
    });

    renderPanel();

    expect(await screen.findByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("Rosa Díaz")).toBeInTheDocument();
    expect(screen.getByText("Luis Gómez")).toBeInTheDocument();
    expect(screen.getByText("Pendiente")).toBeInTheDocument();
    expect(screen.getByText("Repuesto")).toBeInTheDocument();
    expect(screen.getByText("Anulado")).toBeInTheDocument();

    // Encabezado + tres vales; el primero con comprobante adjunto.
    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(within(rows[1]).getByText("Sí")).toBeInTheDocument();
    // Solo el vale pendiente ofrece anular.
    expect(screen.getAllByRole("button", { name: "Anular" })).toHaveLength(1);
  });

  it("cuadra el arqueo: efectivo contado + vales pendientes = fondo total", async () => {
    const user = userEvent.setup();
    mock.setTable("petty_cash_vale", {
      data: [
        valeRow({ id: "33333333-3333-4333-8333-333333333333", amount: 30 }),
        valeRow({ id: "44444444-4444-4444-8444-444444444444", serial: 2, amount: 20, status: "REPUESTO" }),
      ],
      error: null,
    });

    renderPanel();

    // Solo el vale pendiente suma: S/ 30 sobre un fondo de S/ 100.
    await waitFor(() =>
      expect(summaryValue("Vales pendientes")).toHaveTextContent("S/ 30.00")
    );
    expect(summaryValue("Fondo total (fondo fijo)")).toHaveTextContent(
      "S/ 100.00"
    );
    expect(
      screen.getByText(/Ingresa el efectivo contado para cuadrar el arqueo/)
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Efectivo contado (S/)"), "70");

    expect(await screen.findByText("Cuadrado")).toBeInTheDocument();
    expect(
      summaryValue("Efectivo contado + vales pendientes")
    ).toHaveTextContent("S/ 100.00");
  });

  it("señala el faltante cuando el arqueo no llega al fondo", async () => {
    const user = userEvent.setup();
    mock.setTable("petty_cash_vale", {
      data: [valeRow({ id: "33333333-3333-4333-8333-333333333333", amount: 30 })],
      error: null,
    });

    renderPanel();

    await screen.findByText("Juan Pérez");
    await user.type(screen.getByLabelText("Efectivo contado (S/)"), "60");

    expect(await screen.findByText("Faltante")).toBeInTheDocument();
    expect(
      screen.getByText(/S\/ 10.00 respecto al fondo total/)
    ).toBeInTheDocument();
  });

  it("anula un vale pendiente y recarga la lista", async () => {
    const user = userEvent.setup();
    mock.queueTable("petty_cash_vale", {
      data: [valeRow({ id: "33333333-3333-4333-8333-333333333333", serial: 7 })],
      error: null,
    });
    mock.queueTable("petty_cash_vale", { data: [], error: null });
    mock.setRpc("void_petty_cash_vale", { data: null, error: null });

    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Anular" }));

    await waitFor(() =>
      expect(mock.rpcCalls[0]).toEqual({
        name: "void_petty_cash_vale",
        args: { p_vale_id: "33333333-3333-4333-8333-333333333333" },
      })
    );
    // Tras anular se recarga la lista: queda vacía.
    expect(
      await screen.findByText("Aún no hay vales registrados.")
    ).toBeInTheDocument();
  });

  it("abre la reposición con los vales pendientes seleccionados", async () => {
    const user = userEvent.setup();
    mock.setTable("petty_cash_vale", {
      data: [
        valeRow({ id: "33333333-3333-4333-8333-333333333333", serial: 1, amount: 30 }),
        valeRow({ id: "44444444-4444-4444-8444-444444444444", serial: 2, amount: 20, status: "REPUESTO" }),
      ],
      error: null,
    });

    renderPanel();

    await user.click(
      await screen.findByRole("button", { name: "Reponer fondo" })
    );

    const dialog = await screen.findByRole("dialog", {
      name: /Reponer fondo de caja chica/,
    });
    // Solo el vale pendiente se propone para reponer: S/ 30.
    expect(within(dialog).getByText(/N.º 1/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/N.º 2/)).not.toBeInTheDocument();
    expect(
      within(dialog).getByText("Total a reponer").parentElement
    ).toHaveTextContent("S/ 30.00");
  });

  it("repone el fondo con la transferencia atómica", async () => {
    const user = userEvent.setup();
    mock.setTable("petty_cash_vale", {
      data: [valeRow({ id: "33333333-3333-4333-8333-333333333333", serial: 1, amount: 30 })],
      error: null,
    });
    mock.setRpc("replenish_petty_cash", { data: "transfer-1", error: null });

    renderPanel();

    await user.click(
      await screen.findByRole("button", { name: "Reponer fondo" })
    );

    const dialog = await screen.findByRole("dialog", {
      name: /Reponer fondo de caja chica/,
    });

    // Con una sola cuenta candidata, el origen ya viene preseleccionado.
    await user.click(
      within(dialog).getByRole("button", { name: "Reponer fondo" })
    );

    await waitFor(() =>
      expect(mock.rpcCalls[0]).toMatchObject({
        name: "replenish_petty_cash",
        args: {
          p_account_id: "11111111-1111-4111-8111-111111111111",
          p_source_account_id: "22222222-2222-4222-8222-222222222222",
          p_vale_ids: ["33333333-3333-4333-8333-333333333333"],
        },
      })
    );
  });

  it("deshabilita la reposición cuando no hay vales pendientes", async () => {
    mock.setTable("petty_cash_vale", {
      data: [valeRow({ id: "44444444-4444-4444-8444-444444444444", serial: 2, status: "REPUESTO" })],
      error: null,
    });

    renderPanel();

    await waitFor(() =>
      expect(screen.getByText("No hay vales pendientes.")).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Reponer fondo" })).toBeDisabled();
  });
});
