import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { getCashPosition } = vi.hoisted(() => ({
  getCashPosition: vi.fn(async () => 0),
}));

vi.mock("@/lib/caja/caja", () => ({ getCashPosition }));

import { CashCountModal } from "@/components/cajas-bancos/cash-count-modal";
import type { CashAccount } from "@/lib/cuentas/entidades";

const account = (overrides: Partial<CashAccount> = {}): CashAccount => ({
  id: "550e8400-e29b-41d4-a716-446655440000",
  type: "CASH_BOX",
  name: "Caja chica",
  currency: "PEN",
  bankName: null,
  accountNumber: null,
  cci: null,
  closingPeriodicity: null,
  openingBalance: 0,
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

function renderModal(props: {
  account: CashAccount;
  onDone?: (values: unknown) => void;
}) {
  return render(
    <CashCountModal
      open
      onOpenChange={() => {}}
      account={props.account}
      onDone={props.onDone ?? (() => {})}
    />
  );
}

describe("CashCountModal", () => {
  beforeEach(() => {
    getCashPosition.mockReset();
    getCashPosition.mockResolvedValue(0);
  });

  it("muestra la grilla y la diferencia en vivo para una caja", async () => {
    const user = userEvent.setup();
    getCashPosition.mockResolvedValue(500);

    renderModal({ account: account() });

    expect(screen.getByText("Arqueo sorpresivo")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Cantidad de S/ 200"), "2");

    await waitFor(() => {
      expect(screen.getByText("Faltante")).toBeInTheDocument();
      const diffRow = screen.getByText("Diferencia").parentElement;
      expect(diffRow).toHaveTextContent(/100\.00/);
    });
  });

  it("registra el arqueo con el detalle por denominación", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    getCashPosition.mockResolvedValue(400);

    renderModal({ account: account(), onDone });

    await user.type(screen.getByLabelText("Cantidad de S/ 200"), "2");
    await user.type(screen.getByLabelText("Contado por (opcional)"), "Ana Ríos");
    await user.click(screen.getByRole("button", { name: "Registrar arqueo" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone.mock.calls[0][0]).toMatchObject({
      countedBalance: undefined,
      countedBy: "Ana Ríos",
      denominations: expect.arrayContaining([
        { denomination: 200, quantity: 2 },
      ]),
    });
  });

  it("en un banco pide el saldo contado", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();

    renderModal({
      account: account({ type: "BANK_ACCOUNT", isPettyCash: false }),
      onDone,
    });

    expect(screen.getByLabelText("Saldo según extracto")).toBeInTheDocument();
    expect(
      screen.queryByText("Conteo por denominación")
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Registrar arqueo" }));
    await waitFor(() => expect(onDone).not.toHaveBeenCalled());

    await user.type(screen.getByLabelText("Saldo según extracto"), "1200");
    await user.click(screen.getByRole("button", { name: "Registrar arqueo" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone.mock.calls[0][0]).toMatchObject({ countedBalance: 1200 });
  });
});
