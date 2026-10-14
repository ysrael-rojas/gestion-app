import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PettyCashReplenishModal } from "@/components/cajas-bancos/petty-cash-replenish-modal";
import type { PettyCashVale } from "@/lib/caja/caja-chica";
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

const vale = (overrides: Partial<PettyCashVale> = {}): PettyCashVale => ({
  id: "33333333-3333-4333-8333-333333333333",
  accountId: "11111111-1111-4111-8111-111111111111",
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

const bank = account({
  id: "22222222-2222-4222-8222-222222222222",
  type: "BANK_ACCOUNT",
  name: "Cuenta BCP",
  isPettyCash: false,
  changeFund: 0,
});

function renderModal(props: {
  accounts?: CashAccount[];
  pendingVales?: PettyCashVale[];
  onDone?: (values: unknown) => void;
}) {
  return render(
    <PettyCashReplenishModal
      open
      onOpenChange={() => {}}
      account={account()}
      accounts={props.accounts ?? [account(), bank]}
      pendingVales={props.pendingVales ?? [vale()]}
      onDone={props.onDone ?? (() => {})}
    />
  );
}

describe("PettyCashReplenishModal", () => {
  it("preselecciona los vales pendientes y muestra el total", () => {
    renderModal({
      pendingVales: [
        vale({ id: "33333333-3333-4333-8333-333333333333", serial: 1, amount: 30 }),
        vale({ id: "44444444-4444-4444-8444-444444444444", serial: 2, amount: 20, paidTo: "Rosa Díaz" }),
      ],
    });

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/N.º 1/)).toBeInTheDocument();
    expect(within(dialog).getByText(/N.º 2/)).toBeInTheDocument();
    expect(
      within(dialog).getByText("Total a reponer").parentElement
    ).toHaveTextContent("S/ 50.00");
    expect(
      within(dialog).getByRole("checkbox", { name: /N.º 1/ })
    ).toBeChecked();
  });

  it("envía la reposición con el origen y los vales seleccionados", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();

    renderModal({ onDone });

    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Reponer fondo" })
    );

    expect(onDone).toHaveBeenCalledWith({
      accountId: "11111111-1111-4111-8111-111111111111",
      sourceAccountId: "22222222-2222-4222-8222-222222222222",
      valeIds: ["33333333-3333-4333-8333-333333333333"],
    });
  });

  it("recalcula el total al desmarcar un vale", async () => {
    const user = userEvent.setup();

    renderModal({
      pendingVales: [
        vale({ id: "33333333-3333-4333-8333-333333333333", serial: 1, amount: 30 }),
        vale({ id: "44444444-4444-4444-8444-444444444444", serial: 2, amount: 20, paidTo: "Rosa Díaz" }),
      ],
    });

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox", { name: /N.º 2/ }));

    expect(
      within(dialog).getByText("Total a reponer").parentElement
    ).toHaveTextContent("S/ 30.00");
  });

  it("exige elegir la cuenta de origen cuando hay varias candidatas", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();

    renderModal({
      accounts: [account(), bank, account({ id: "66666666-6666-4666-8666-666666666666", name: "BBVA" })],
      onDone,
    });

    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Reponer fondo" })
    );

    expect(onDone).not.toHaveBeenCalled();
    expect(
      within(dialog).getByText("Selecciona la cuenta de origen.")
    ).toBeInTheDocument();
  });
});
