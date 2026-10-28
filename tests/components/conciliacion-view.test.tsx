import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mock, accounts, toast, downloadCsv } = await vi.hoisted(async () => {
  const { createMockSupabase } = await import("@/tests/__mocks__/supabase");
  return {
    mock: createMockSupabase(),
    toast: { success: vi.fn(), error: vi.fn() },
    downloadCsv: vi.fn(),
    accounts: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        type: "CASH_BOX",
        name: "Caja General",
        currency: "PEN",
        isActive: true,
        isPettyCash: false,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        type: "BANK_ACCOUNT",
        name: "Banco BCP",
        currency: "PEN",
        isActive: true,
        isPettyCash: false,
      },
    ],
  };
});

vi.mock("@/lib/supabase/client", () => ({ supabase: mock.client }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/caja/csv", async () => {
  const actual = await vi.importActual<typeof import("@/lib/caja/csv")>(
    "@/lib/caja/csv"
  );
  return { ...actual, downloadCsv };
});
vi.mock("@/components/cajas-bancos/cajas-bancos-provider", () => ({
  useCajasBancos: () => ({ accounts, isLoading: false }),
}));
vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils")>(
    "@/lib/utils"
  );
  return { ...actual, getTodayLocalDate: () => "2026-10-28" };
});

import { ConciliacionView } from "@/components/cajas-bancos/conciliacion-view";

const bankId = "22222222-2222-4222-8222-222222222222";

const savedHeader = (overrides: Record<string, unknown> = {}) => ({
  id: "rec-1",
  owner_id: "owner-1",
  cash_account_id: bankId,
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

const savedItem = (overrides: Record<string, unknown> = {}) => ({
  id: "item-1",
  reconciliation_id: "rec-1",
  kind: "DEPOSITO_EN_TRANSITO",
  description: "Depósito 30/10",
  amount: 970,
  created_at: "2026-10-31T10:00:00Z",
  ...overrides,
});

const paymentRow = (overrides: Record<string, unknown> = {}) => ({
  id: "pay-1",
  entity_id: null,
  direction: "INGRESO",
  payment_date: "2026-10-05",
  receipt_serial: 1,
  receipt_number: "RI-000001",
  amount: 850,
  method_id: "m-1",
  cash_account_id: bankId,
  category_id: "cat-1",
  reference: null,
  status: "EN_REVISION",
  void_reason: null,
  voided_at: null,
  notes: null,
  is_cash_movement: false,
  cash_account: { name: "Banco BCP", currency: "PEN" },
  payment_method: { name: "Transferencia" },
  cash_receipt_category: { name: "Cobranza de venta" },
  ...overrides,
});

function differenceRow(): HTMLElement {
  return screen.getByText("Diferencia").parentElement
    ?.parentElement as HTMLElement;
}

describe("ConciliacionView", () => {
  beforeEach(() => {
    mock.reset();
    toast.success.mockReset();
    toast.error.mockReset();
    downloadCsv.mockReset();
    vi.spyOn(window, "print").mockImplementation(() => {});

    mock.setTable("bank_reconciliation", { data: [], error: null });
    mock.setTable("bank_reconciliation_item", { data: [], error: null });
    mock.setTable("payment", {
      data: [
        paymentRow(),
        paymentRow({
          id: "pay-2",
          direction: "EGRESO",
          receipt_number: "RE-000001",
          amount: 300,
          payment_date: "2026-10-07",
        }),
        paymentRow({
          id: "pay-3",
          direction: "INGRESO",
          receipt_number: "RI-000002",
          amount: 500,
          status: "PROCESADO",
        }),
      ],
      error: null,
    });
    mock.setRpc("get_cash_position", { data: 18420, error: null });
  });

  it("solo lista cuentas bancarias", async () => {
    render(<ConciliacionView />);

    expect(await screen.findByText(/Banco BCP · PEN/)).toBeInTheDocument();
    expect(screen.queryByText(/Caja General · PEN/)).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Cuenta bancaria")
    ).toBeInTheDocument();
  });

  it("abre con el mes actual precargado", async () => {
    render(<ConciliacionView />);

    await screen.findByText(/Banco BCP · PEN/);
    expect(screen.getByLabelText("Desde")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("Hasta")).toHaveValue("2026-10-31");
  });

  it("muestra el saldo según registros y las sugerencias del período", async () => {
    render(<ConciliacionView />);

    expect(await screen.findByText("Saldo según mis registros")).toBeInTheDocument();

    const booksCard = screen.getByText("Saldo según mis registros")
      .parentElement?.parentElement as HTMLElement;
    expect(booksCard).toHaveTextContent("S/ 18,420.00");

    expect(
      screen.getByRole("button", { name: /Agregar RI-000001 como partida/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Agregar RE-000001 como partida/ })
    ).toBeInTheDocument();
    // Un recibo PROCESADO no se sugiere.
    expect(
      screen.queryByRole("button", { name: /Agregar RI-000002 como partida/ })
    ).not.toBeInTheDocument();
  });

  it("carga una conciliación guardada con sus partidas", async () => {
    mock.setTable("bank_reconciliation", { data: [savedHeader()], error: null });
    mock.setTable("bank_reconciliation_item", {
      data: [savedItem()],
      error: null,
    });

    render(<ConciliacionView />);

    expect(
      await screen.findByDisplayValue("17955.3")
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Depósito 30/10")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Ana Ríos")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Luis Paredes")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Octubre")).toBeInTheDocument();
    // 18,420 − (17,955.30 + 970) = −505.30.
    expect(differenceRow()).toHaveTextContent("505.30");
  });

  it("agrega una sugerencia como partida y recalcula en vivo", async () => {
    const user = userEvent.setup();

    render(<ConciliacionView />);

    const suggestion = await screen.findByRole("button", {
      name: /Agregar RI-000001 como partida/,
    });
    await user.click(suggestion);

    expect(screen.getByDisplayValue("Recibo RI-000001")).toBeInTheDocument();
    expect(screen.getByDisplayValue("850")).toBeInTheDocument();
    // 18,420 − (0 + 850) = 17,570.
    expect(differenceRow()).toHaveTextContent("S/ 17,570.00");
    // La sugerencia ya no se ofrece dos veces.
    expect(
      screen.queryByRole("button", { name: /Agregar RI-000001 como partida/ })
    ).not.toBeInTheDocument();
  });

  it("agrega una partida manual y quita la anterior", async () => {
    const user = userEvent.setup();

    render(<ConciliacionView />);

    await screen.findByText("Saldo según mis registros");
    await user.click(screen.getByRole("button", { name: /Agregar partida/ }));

    fireEvent.change(screen.getByLabelText("Descripción de la partida 1"), {
      target: { value: "ITF de octubre" },
    });
    fireEvent.change(screen.getByLabelText("Monto de la partida 1"), {
      target: { value: "15.30" },
    });

    // 18,420 − (0 + 15.30) = 18,404.70 (la clase por defecto suma).
    expect(differenceRow()).toHaveTextContent("S/ 18,404.70");

    await user.click(screen.getByRole("button", { name: /Quitar partida 1/ }));

    expect(
      screen.queryByLabelText("Descripción de la partida 1")
    ).not.toBeInTheDocument();
    expect(differenceRow()).toHaveTextContent("S/ 18,420.00");
  });

  it("muestra Conciliado cuando la diferencia llega a cero", async () => {
    render(<ConciliacionView />);

    await screen.findByText("Saldo según mis registros");
    fireEvent.change(screen.getByLabelText("Saldo según extracto bancario"), {
      target: { value: "18420" },
    });

    await waitFor(() =>
      expect(screen.getByText("Conciliado")).toBeInTheDocument()
    );
    expect(differenceRow()).toHaveTextContent("S/ 0.00");
    expect(
      screen.queryByText(/Hay una diferencia por encontrar/)
    ).not.toBeInTheDocument();
  });

  it("no guarda una partida sin descripción", async () => {
    const user = userEvent.setup();

    render(<ConciliacionView />);

    await screen.findByText("Saldo según mis registros");
    await user.click(screen.getByRole("button", { name: /Agregar partida/ }));
    await user.click(
      screen.getByRole("button", { name: /Guardar conciliación/ })
    );

    expect(
      await screen.findByText(/Escribe una descripción para la partida/)
    ).toBeInTheDocument();
    expect(
      mock.rpcCalls.some((call) => call.name === "save_bank_reconciliation")
    ).toBe(false);
  });

  it("guarda cabecera y partidas por la RPC atómica", async () => {
    const user = userEvent.setup();

    render(<ConciliacionView />);

    await screen.findByText("Saldo según mis registros");
    fireEvent.change(screen.getByLabelText("Saldo según extracto bancario"), {
      target: { value: "17955.30" },
    });
    await user.click(
      screen.getByRole("button", { name: /Agregar RI-000001 como partida/ })
    );
    fireEvent.change(screen.getByLabelText("Elaborado por"), {
      target: { value: "Ana Ríos" },
    });

    mock.setRpc("save_bank_reconciliation", { data: "rec-1", error: null });
    mock.setTable("bank_reconciliation", {
      data: [savedHeader()],
      error: null,
    });
    mock.setTable("bank_reconciliation_item", {
      data: [savedItem()],
      error: null,
    });

    await user.click(
      screen.getByRole("button", { name: /Guardar conciliación/ })
    );

    await waitFor(() =>
      expect(
        mock.rpcCalls.some((call) => call.name === "save_bank_reconciliation")
      ).toBe(true)
    );

    const saveCall = mock.rpcCalls.find(
      (call) => call.name === "save_bank_reconciliation"
    );

    expect(saveCall?.args).toMatchObject({
      p_reconciliation: {
        cash_account_id: bankId,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        statement_balance: 17955.3,
        books_balance: 18420,
        prepared_by: "Ana Ríos",
      },
      p_items: [
        {
          kind: "DEPOSITO_EN_TRANSITO",
          description: "Recibo RI-000001",
          amount: 850,
        },
      ],
    });
    expect(toast.success).toHaveBeenCalledWith("Conciliación guardada");
  });

  it("actualiza el saldo según registros desde la RPC", async () => {
    const user = userEvent.setup();

    render(<ConciliacionView />);

    await screen.findByText("Saldo según mis registros");
    mock.queueRpc("get_cash_position", { data: 19000, error: null });

    await user.click(
      screen.getByRole("button", { name: /Actualizar libros/ })
    );

    await waitFor(() => {
      const booksCard = screen.getByText("Saldo según mis registros")
        .parentElement?.parentElement as HTMLElement;
      expect(booksCard).toHaveTextContent("S/ 19,000.00");
    });
  });

  it("descarga el CSV con cabecera, partidas y totales", async () => {
    const user = userEvent.setup();

    render(<ConciliacionView />);

    await screen.findByText("Saldo según mis registros");
    fireEvent.change(screen.getByLabelText("Saldo según extracto bancario"), {
      target: { value: "17955.30" },
    });
    await user.click(
      screen.getByRole("button", { name: /Agregar RI-000001 como partida/ })
    );

    await user.click(
      screen.getByRole("button", { name: /Descargar CSV/ })
    );

    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [filename, csv] = downloadCsv.mock.calls[0] as [string, string];

    expect(filename).toBe(
      "conciliacion-Banco BCP-2026-10-01_2026-10-31.csv"
    );
    expect(csv).toContain("Conciliación bancaria");
    expect(csv).toContain("Signo");
    expect(csv).toContain("Depósito en tránsito");
    expect(csv).toContain("Recibo RI-000001");
    expect(csv).toContain("Saldo conciliado");
    expect(csv).toContain("Diferencia");
  });

  it("abre la impresión del acta con el formato oficial", async () => {
    const user = userEvent.setup();

    render(<ConciliacionView />);

    await screen.findByText("Saldo según mis registros");
    fireEvent.change(screen.getByLabelText("Saldo según extracto bancario"), {
      target: { value: "17955.30" },
    });
    await user.click(
      screen.getByRole("button", { name: /Agregar RI-000001 como partida/ })
    );
    await user.click(screen.getByRole("button", { name: /Imprimir acta/ }));

    expect(window.print).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText("Acta de conciliación bancaria")
    ).toBeInTheDocument();
    expect(screen.getAllByText("Elaborado por")).toHaveLength(2);
    expect(screen.getAllByText("Revisado por")).toHaveLength(2);
  });
});
