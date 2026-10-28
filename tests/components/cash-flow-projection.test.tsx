import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { listCashPositionsConsolidated, getPenUsdRate, listOpenVouchers, downloadCsv } =
  vi.hoisted(() => ({
    listCashPositionsConsolidated: vi.fn(),
    getPenUsdRate: vi.fn(),
    listOpenVouchers: vi.fn(),
    downloadCsv: vi.fn(),
  }));

vi.mock("@/lib/caja/caja", () => ({
  listCashPositionsConsolidated,
  getPenUsdRate,
}));
vi.mock("@/lib/pagos/cartera", () => ({ listOpenVouchers }));
vi.mock("@/lib/caja/csv", async () => {
  const actual = await vi.importActual<typeof import("@/lib/caja/csv")>(
    "@/lib/caja/csv"
  );
  return { ...actual, downloadCsv };
});
vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils")>(
    "@/lib/utils"
  );
  return { ...actual, getTodayLocalDate: () => "2026-10-28" };
});

import { CashFlowProjection } from "@/components/cajas-bancos/cash-flow-projection";
import type { VoucherBalance } from "@/components/pagos/types";

const position = (balance: number, currency = "PEN") => ({
  account: {
    id: "acc-1",
    name: "Caja General",
    currency,
    type: "CASH_BOX",
    isActive: true,
  },
  balance,
});

const voucher = (
  overrides: Partial<VoucherBalance> = {}
): VoucherBalance => ({
  comprobanteId: "c-1",
  entityId: "e-1",
  voucherKind: "VENTA",
  voucherType: "FACTURA",
  voucherNumber: "F001-000001",
  issueDate: "2026-10-01",
  effectiveDueDate: "2026-10-30",
  paymentType: "CREDITO",
  total: 100,
  paidAmount: 0,
  balance: 100,
  ...overrides,
});

describe("CashFlowProjection", () => {
  beforeEach(() => {
    listCashPositionsConsolidated.mockReset();
    getPenUsdRate.mockReset();
    listOpenVouchers.mockReset();
    downloadCsv.mockReset();

    listCashPositionsConsolidated.mockResolvedValue([position(15450)]);
    getPenUsdRate.mockResolvedValue(3.75);
    listOpenVouchers.mockImplementation((direction: string) =>
      Promise.resolve(
        direction === "INGRESO"
          ? [
              voucher({
                comprobanteId: "r-vencida",
                effectiveDueDate: "2026-10-20",
                balance: 1500,
              }),
              voucher({
                comprobanteId: "r-sem1",
                effectiveDueDate: "2026-10-30",
                balance: 2000,
              }),
            ]
          : [
              voucher({
                comprobanteId: "p-sem1",
                voucherKind: "COMPRA",
                effectiveDueDate: "2026-10-31",
                balance: 500,
              }),
            ]
      )
    );
  });

  it("muestra el disponible consolidado y las 4 semanas", async () => {
    render(<CashFlowProjection />);

    expect(await screen.findByText(/Disponible hoy:/)).toHaveTextContent(
      "S/ 15,450.00"
    );
    expect(screen.getByText(/26\/10\/2026 → 01\/11\/2026/)).toBeInTheDocument();
    expect(screen.getByText("Sem 4")).toBeInTheDocument();
    expect(screen.getByText("Atrasado")).toBeInTheDocument();
    expect(screen.getByText("Cobranzas")).toBeInTheDocument();
    expect(screen.getByText("Pagos")).toBeInTheDocument();
    expect(screen.getByText("Queda")).toBeInTheDocument();

    // 15,450 + 1,500 (atrasado) + 2,000 − 500 = 18,450 en las 4 semanas.
    const quedaRow = screen.getByText("Queda").closest("tr") as HTMLElement;
    expect(quedaRow).toHaveTextContent("S/ 18,450.00");
  });

  it("alerta cuando una semana queda negativa", async () => {
    listCashPositionsConsolidated.mockResolvedValue([position(100)]);
    listOpenVouchers.mockImplementation((direction: string) =>
      Promise.resolve(
        direction === "INGRESO"
          ? []
          : [
              voucher({
                comprobanteId: "p-grande",
                voucherKind: "COMPRA",
                effectiveDueDate: "2026-10-29",
                balance: 500,
              }),
            ]
      )
    );

    render(<CashFlowProjection />);

    expect(
      await screen.findByText(/No te alcanza la semana del 26\/10\/2026/)
    ).toBeInTheDocument();
  });

  it("muestra el crédito sin fecha como no considerado", async () => {
    listOpenVouchers.mockImplementation((direction: string) =>
      Promise.resolve(
        direction === "INGRESO"
          ? [voucher({ effectiveDueDate: null, balance: 1200 })]
          : []
      )
    );

    render(<CashFlowProjection />);

    expect(
      await screen.findByText(/Sin fecha de cobro\/pago:/)
    ).toBeInTheDocument();
    expect(screen.getByText(/S\/ 1,200.00 por cobrar/)).toBeInTheDocument();
  });

  it("descarga el CSV del flujo proyectado", async () => {
    const user = userEvent.setup();

    render(<CashFlowProjection />);

    await screen.findByText(/Disponible hoy:/);
    await user.click(screen.getByRole("button", { name: /Descargar CSV/ }));

    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [filename, csv] = downloadCsv.mock.calls[0] as [string, string];

    expect(filename).toBe("flujo-proyectado-2026-10-28.csv");
    expect(csv).toContain("Flujo de caja proyectado");
    expect(csv).toContain("Sem 1");
    expect(csv).toContain("Sin fecha (no considerado)");
  });

  it("convierte las cuentas en dólares con el tipo de cambio", async () => {
    listCashPositionsConsolidated.mockResolvedValue([
      position(1000, "PEN"),
      position(100, "USD"),
    ]);

    render(<CashFlowProjection />);

    await waitFor(() => {
      // 1,000 + (100 × 3.75) = 1,375.
      expect(screen.getByText(/Disponible hoy:/)).toHaveTextContent(
        "S/ 1,375.00"
      );
    });
  });
});
