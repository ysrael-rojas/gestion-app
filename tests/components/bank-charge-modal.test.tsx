import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const mock = vi.hoisted(() => ({
  getLastClose: vi.fn(),
  listCategories: vi.fn(),
  listPaymentMethods: vi.fn(),
  ensureCatalogsSeeded: vi.fn(),
}));

vi.mock("@/lib/caja/caja", () => ({
  getLastClose: mock.getLastClose,
  listCategories: mock.listCategories,
  listPaymentMethods: mock.listPaymentMethods,
  ensureCatalogsSeeded: mock.ensureCatalogsSeeded,
}));

import { BankChargeModal } from "@/components/cajas-bancos/bank-charge-modal";
import type { CashAccount } from "@/lib/cuentas/entidades";
import { getTodayLocalDate } from "@/lib/utils";

const account = (overrides: Partial<CashAccount> = {}): CashAccount => ({
  id: "11111111-1111-4111-8111-111111111111",
  type: "BANK_ACCOUNT",
  name: "Banco BCP",
  currency: "PEN",
  bankName: "BCP",
  accountNumber: null,
  cci: null,
  closingPeriodicity: null,
  openingBalance: 0,
  openingBalanceDate: "2026-10-01",
  notes: null,
  isActive: true,
  isPettyCash: false,
  changeFund: 0,
  pettyExpenseLimit: null,
  custodianName: null,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  deletedAt: null,
  ...overrides,
});

function renderModal() {
  return render(
    <BankChargeModal
      open
      onOpenChange={() => {}}
      account={account()}
      onDone={() => {}}
    />
  );
}

describe("BankChargeModal", () => {
  beforeEach(() => {
    mock.getLastClose.mockReset();
    mock.listCategories.mockReset().mockResolvedValue([]);
    mock.listPaymentMethods.mockReset().mockResolvedValue([]);
    mock.ensureCatalogsSeeded.mockReset().mockResolvedValue(undefined);
  });

  it("propone el primer día abierto tras el último cierre", async () => {
    mock.getLastClose.mockResolvedValue({ periodEnd: "2026-10-31" });

    renderModal();

    const date = screen.getByLabelText("Fecha") as HTMLInputElement;

    await waitFor(() => expect(date.value).toBe("2026-11-01"));
    expect(date).toHaveAttribute("min", "2026-11-01");
  });

  it("propone hoy cuando la cuenta no tiene cierres", async () => {
    mock.getLastClose.mockResolvedValue(null);

    renderModal();

    const date = screen.getByLabelText("Fecha") as HTMLInputElement;

    await waitFor(() => expect(date.value).toBe(getTodayLocalDate()));
  });
});
