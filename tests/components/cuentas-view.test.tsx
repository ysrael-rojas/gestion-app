import { beforeEach, describe, expect, it, vi } from "vitest";

const { listCashPositionsConsolidated, getPenUsdRate, listLastMovementDates } =
  vi.hoisted(() => ({
    listCashPositionsConsolidated: vi.fn(),
    getPenUsdRate: vi.fn(),
    listLastMovementDates: vi.fn(),
  }));

vi.mock("@/lib/caja/caja", () => ({
  listCashPositionsConsolidated,
  getPenUsdRate,
  listLastMovementDates,
}));
vi.mock("@/lib/caja/transferencias", () => ({ createCashTransfer: vi.fn() }));
vi.mock("@/lib/pagos/pagos", () => ({ createPayment: vi.fn() }));
vi.mock("@/lib/caja/movimientos", () => ({ cashMovementToPayment: vi.fn() }));
vi.mock("@/components/cajas-bancos/cash-transfer-modal", () => ({
  CashTransferModal: () => null,
}));
vi.mock("@/components/cajas-bancos/cash-movement-modal", () => ({
  CashMovementModal: () => null,
}));
vi.mock("@/components/cajas-bancos/petty-cash-panel", () => ({
  PettyCashPanel: () => null,
}));

import { render, screen } from "@testing-library/react";

import { CuentasView } from "@/components/cajas-bancos/cuentas-view";
import type { CashAccountPosition } from "@/lib/caja/caja";
import type { CashAccount } from "@/lib/cuentas/entidades";

const account = (overrides: Partial<CashAccount> = {}): CashAccount => ({
  id: "acc-1",
  type: "CASH_BOX",
  name: "Caja General",
  currency: "PEN",
  bankName: null,
  accountNumber: null,
  cci: null,
  closingPeriodicity: "DAILY",
  openingBalance: 800,
  openingBalanceDate: "2026-10-20",
  notes: null,
  isActive: true,
  isPettyCash: false,
  changeFund: 0,
  pettyExpenseLimit: null,
  custodianName: null,
  createdAt: "2026-10-20T00:00:00Z",
  updatedAt: "2026-10-20T00:00:00Z",
  deletedAt: null,
  ...overrides,
});

const positions: CashAccountPosition[] = [
  { account: account(), balance: 15409 },
  {
    account: account({
      id: "acc-2",
      type: "BANK_ACCOUNT",
      name: "Banco BCP",
      bankName: "BCP",
      closingPeriodicity: "MONTHLY",
    }),
    balance: 24194,
  },
];

describe("CuentasView", () => {
  beforeEach(() => {
    listCashPositionsConsolidated.mockReset();
    getPenUsdRate.mockReset();
    listLastMovementDates.mockReset();

    listCashPositionsConsolidated.mockResolvedValue(positions);
    getPenUsdRate.mockResolvedValue(3.75);
    listLastMovementDates.mockResolvedValue({
      "acc-1": "2026-10-27",
      "acc-2": "2026-10-27",
    });
  });

  it("muestra cuentas, saldos y último movimiento", async () => {
    render(<CuentasView />);

    expect(await screen.findByText("Caja General")).toBeInTheDocument();
    expect(screen.getByText("Banco BCP")).toBeInTheDocument();
    expect(screen.getAllByText("S/ 15,409.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("S/ 24,194.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("27/10/2026")).toHaveLength(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("si falla el último movimiento conserva cuentas y saldos con un aviso discreto", async () => {
    listLastMovementDates.mockRejectedValue(
      new Error("La consulta usó una función no permitida por la API.")
    );

    render(<CuentasView />);

    expect(await screen.findByText("Caja General")).toBeInTheDocument();
    expect(screen.getAllByText("S/ 15,409.00").length).toBeGreaterThan(0);
    expect(screen.getByRole("status")).toHaveTextContent(
      /No se pudo cargar el último movimiento/
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("si fallan los saldos muestra el error de página y no lista cuentas", async () => {
    listCashPositionsConsolidated.mockRejectedValue(
      new Error(
        "No se pudo completar la operación con la base de datos. Intenta nuevamente."
      )
    );

    render(<CuentasView />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se pudo completar la operación con la base de datos. Intenta nuevamente."
    );
    expect(screen.queryByText("Caja General")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
