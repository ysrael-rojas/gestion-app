import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mock, downloadCsv, account } = await vi.hoisted(async () => {
  const { createMockSupabase } = await import("@/tests/__mocks__/supabase");
  return {
    mock: createMockSupabase(),
    downloadCsv: vi.fn(),
    account: {
      id: "11111111-1111-4111-8111-111111111111",
      type: "CASH_BOX",
      name: "Caja General",
      currency: "PEN",
      isActive: true,
      isPettyCash: false,
    },
  };
});

vi.mock("@/lib/supabase/client", () => ({ supabase: mock.client }));
vi.mock("@/lib/caja/csv", async () => {
  const actual = await vi.importActual<typeof import("@/lib/caja/csv")>(
    "@/lib/caja/csv"
  );
  return { ...actual, downloadCsv };
});
vi.mock("@/components/cajas-bancos/cajas-bancos-provider", () => ({
  useCajasBancos: () => ({ accounts: [account], isLoading: false }),
}));

import { ExtractosView } from "@/components/cajas-bancos/extractos-view";
import { getMonthRange } from "@/lib/caja/dashboard";
import { getTodayLocalDate } from "@/lib/utils";

const today = getTodayLocalDate();
const month = getMonthRange(today);

const paymentRow = (overrides: Record<string, unknown> = {}) => ({
  id: "pay-1",
  entity_id: null,
  direction: "INGRESO",
  payment_date: "2026-10-05",
  receipt_serial: 1,
  receipt_number: "RI-000001",
  amount: 100,
  method_id: "m-1",
  cash_account_id: account.id,
  category_id: "cat-1",
  reference: null,
  status: "EN_REVISION",
  void_reason: null,
  voided_at: null,
  notes: null,
  is_cash_movement: false,
  cash_account: { name: "Caja General", currency: "PEN" },
  payment_method: { name: "Efectivo" },
  cash_receipt_category: { name: "Cobranza de venta" },
  ...overrides,
});

const transferRow = (overrides: Record<string, unknown> = {}) => ({
  id: "transfer-1",
  owner_id: "owner-1",
  source_account_id: account.id,
  target_account_id: "22222222-2222-4222-8222-222222222222",
  amount: 50,
  transfer_date: "2026-10-06",
  notes: "Depósito",
  created_at: "2026-10-06T10:00:00Z",
  ...overrides,
});

describe("ExtractosView", () => {
  beforeEach(() => {
    mock.reset();
    downloadCsv.mockReset();
    mock.setTable("payment", {
      data: [
        paymentRow(),
        paymentRow({
          id: "pay-2",
          direction: "EGRESO",
          receipt_number: "RE-000001",
          receipt_serial: 1,
          amount: 30,
          payment_date: "2026-10-07",
          status: "PROCESADO",
          cash_receipt_category: { name: "Gasto operativo" },
        }),
      ],
      error: null,
    });
    mock.setTable("cash_transfer", { data: [transferRow()], error: null });
  });

  it("abre con el mes actual precargado", async () => {
    render(<ExtractosView />);

    expect(screen.getByLabelText("Desde")).toHaveValue(month.start);
    expect(screen.getByLabelText("Hasta")).toHaveValue(month.end);
    await waitFor(() =>
      expect(screen.getByText("RI-000001")).toBeInTheDocument()
    );
  });

  it("lista recibos y transferencias con el resumen del rango", async () => {
    render(<ExtractosView />);

    expect(await screen.findByText("RI-000001")).toBeInTheDocument();
    expect(screen.getByText("RE-000001")).toBeInTheDocument();
    expect(screen.getByText("Transferencia entre cuentas")).toBeInTheDocument();

    // Ingresos 100, egresos 30, dos recibos y una transferencia.
    function summaryCard(label: string): HTMLElement {
      return screen.getByText(label).parentElement?.parentElement as HTMLElement;
    }

    expect(summaryCard("Ingresos")).toHaveTextContent("S/ 100.00");
    expect(summaryCard("Egresos")).toHaveTextContent("S/ 30.00");
    expect(summaryCard("Movimientos")).toHaveTextContent("2");
    expect(summaryCard("Transferencias")).toHaveTextContent("1");
  });

  it("descarga el CSV del extracto con cabecera y columnas", async () => {
    const user = userEvent.setup();

    render(<ExtractosView />);

    await screen.findByText("RI-000001");
    await user.click(
      screen.getByRole("button", { name: /Descargar CSV/ })
    );

    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [filename, csv] = downloadCsv.mock.calls[0] as [string, string];

    expect(filename).toBe(
      `extracto-Caja General-${month.start}_${month.end}.csv`
    );
    expect(csv).toContain("Extracto de cuenta");
    expect(csv).toContain("RI-000001");
    expect(csv).toContain("Transferencia");
  });

  it("explica el vacío cuando no hay movimientos", async () => {
    mock.setTable("payment", { data: [], error: null });
    mock.setTable("cash_transfer", { data: [], error: null });

    render(<ExtractosView />);

    expect(
      await screen.findByText(/No hay movimientos en ese rango/i)
    ).toBeInTheDocument();
  });
});
