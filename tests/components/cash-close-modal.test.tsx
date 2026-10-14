import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CashCloseModal } from "@/components/cajas-bancos/cash-close-modal";
import type { CashAccount } from "@/lib/cuentas/entidades";

const account = (overrides: Partial<CashAccount> = {}): CashAccount => ({
  id: "550e8400-e29b-41d4-a716-446655440000",
  type: "CASH_BOX",
  name: "Caja principal",
  currency: "PEN",
  bankName: null,
  accountNumber: null,
  cci: null,
  closingPeriodicity: null,
  openingBalance: 0,
  openingBalanceDate: "2026-10-01",
  notes: null,
  isActive: true,
  isPettyCash: false,
  changeFund: 100,
  pettyExpenseLimit: null,
  custodianName: null,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  deletedAt: null,
  ...overrides,
});

const period = { periodStart: "2026-10-01", periodEnd: "2026-10-14" };

function renderModal(props: {
  account: CashAccount;
  onClose?: (values: unknown) => void;
}) {
  return render(
    <CashCloseModal
      open
      onOpenChange={() => {}}
      account={props.account}
      defaultPeriod={period}
      onClose={props.onClose ?? (() => {})}
    />
  );
}

describe("CashCloseModal", () => {
  it("muestra la grilla de denominaciones de S/ 200 a S/ 0.10 en una caja", () => {
    renderModal({ account: account() });

    expect(screen.getByLabelText("Cantidad de S/ 200")).toBeInTheDocument();
    expect(screen.getByLabelText("Cantidad de S/ 100")).toBeInTheDocument();
    expect(screen.getByLabelText("Cantidad de S/ 0.50")).toBeInTheDocument();
    expect(screen.getByLabelText("Cantidad de S/ 0.10")).toBeInTheDocument();
  });

  it("calcula en vivo el total y el efectivo neto (total − fondo de cambio)", async () => {
    const user = userEvent.setup();

    renderModal({ account: account({ changeFund: 100 }) });

    await user.type(screen.getByLabelText("Cantidad de S/ 100"), "3");
    await user.type(screen.getByLabelText("Cantidad de S/ 50"), "2");
    await user.type(screen.getByLabelText("Cantidad de S/ 0.50"), "1");

    // 3 × 100 + 2 × 50 + 1 × 0.50 = S/ 400.50; menos el fondo de S/ 100.
    await waitFor(() => {
      expect(screen.getByText("S/ 400.50")).toBeInTheDocument();
      expect(screen.getByText("S/ 300.50")).toBeInTheDocument();
    });
  });

  it("envía el detalle por denominación al cerrar una caja", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderModal({ account: account(), onClose });

    await user.type(screen.getByLabelText("Cantidad de S/ 200"), "2");
    await user.click(screen.getByRole("button", { name: "Cerrar caja" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

    const values = onClose.mock.calls[0][0] as {
      denominations?: { denomination: number; quantity?: number }[];
      countedBalance?: number;
    };
    expect(values.countedBalance).toBeUndefined();
    expect(
      values.denominations?.filter((row) => (row.quantity ?? 0) > 0)
    ).toEqual([{ denomination: 200, quantity: 2 }]);
  });

  it("no cierra una caja sin conteo por denominación", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    renderModal({ account: account(), onClose });

    await user.click(screen.getByRole("button", { name: "Cerrar caja" }));

    await waitFor(() => expect(onClose).not.toHaveBeenCalled());
  });

  it("no muestra la grilla en un banco", () => {
    renderModal({
      account: account({ type: "BANK_ACCOUNT", bankName: "BCP" }),
    });

    expect(screen.queryByLabelText("Cantidad de S/ 200")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Arqueo por denominación")
    ).not.toBeInTheDocument();
  });
});
