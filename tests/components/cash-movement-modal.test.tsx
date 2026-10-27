import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mock = vi.hoisted(() => ({
  getLastClose: vi.fn(),
  ensureCatalogsSeeded: vi.fn(),
  listCategories: vi.fn(),
  listPaymentMethods: vi.fn(),
}));

vi.mock("@/lib/caja/caja", () => ({
  getLastClose: mock.getLastClose,
  ensureCatalogsSeeded: mock.ensureCatalogsSeeded,
  listCategories: mock.listCategories,
  listPaymentMethods: mock.listPaymentMethods,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { CashMovementModal } from "@/components/cajas-bancos/cash-movement-modal";
import type { CashAccount } from "@/lib/cuentas/entidades";

const account = (overrides: Partial<CashAccount> = {}): CashAccount => ({
  id: "11111111-1111-4111-8111-111111111111",
  type: "CASH_BOX",
  name: "Caja General",
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
  changeFund: 0,
  pettyExpenseLimit: null,
  custodianName: null,
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
    <CashMovementModal
      open
      onOpenChange={() => {}}
      account={props.account}
      onDone={props.onDone ?? (() => {})}
    />
  );
}

describe("CashMovementModal", () => {
  beforeEach(() => {
    mock.getLastClose.mockReset().mockResolvedValue({ periodEnd: "2026-10-10" });
    mock.ensureCatalogsSeeded.mockReset().mockResolvedValue(undefined);
    mock.listPaymentMethods.mockReset().mockResolvedValue([
      {
        id: "550e8400-e29b-41d4-a716-446655440010",
        code: "EFECTIVO",
        name: "Efectivo",
        isActive: true,
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440012",
        code: "TRANSFERENCIA_BCP",
        name: "Transferencia BCP",
        isActive: true,
      },
    ]);
    mock.listCategories.mockReset().mockResolvedValue([
      {
        id: "550e8400-e29b-41d4-a716-446655440011",
        direction: "EGRESO",
        name: "Gasto operativo",
        code: "GASTO_OPERATIVO",
        isActive: true,
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440013",
        direction: "INGRESO",
        name: "Aporte del propietario",
        code: "APORTE_PROPIETARIO",
        isActive: true,
      },
    ]);
  });

  it("preselecciona Efectivo en una caja y propone el primer día abierto", async () => {
    renderModal({ account: account() });

    expect(await screen.findByText("Efectivo")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        (screen.getByLabelText("Fecha") as HTMLInputElement).value
      ).toBe("2026-10-11");
    });
  });

  it("registra un egreso sin entidad con la categoría elegida", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();

    renderModal({ account: account(), onDone });

    await screen.findByText("Efectivo");
    await user.type(screen.getByLabelText("Importe (S/)"), "25");
    await user.click(screen.getByLabelText("Categoría"));
    await user.click(await screen.findByRole("option", { name: "Gasto operativo" }));
    await user.click(
      screen.getByRole("button", { name: "Registrar movimiento" })
    );

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(onDone.mock.calls[0][0]).toMatchObject({
      direction: "EGRESO",
      methodId: "550e8400-e29b-41d4-a716-446655440010",
      categoryId: "550e8400-e29b-41d4-a716-446655440011",
      amount: 25,
      movementDate: "2026-10-11",
    });
  });

  it("rechaza una fecha dentro de un periodo cerrado", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();

    renderModal({ account: account(), onDone });

    await screen.findByText("Efectivo");
    await user.type(screen.getByLabelText("Importe (S/)"), "25");
    await user.click(screen.getByLabelText("Categoría"));
    await user.click(await screen.findByRole("option", { name: "Gasto operativo" }));
    fireEvent.change(screen.getByLabelText("Fecha"), {
      target: { value: "2026-10-05" },
    });
    await user.click(
      screen.getByRole("button", { name: "Registrar movimiento" })
    );

    await waitFor(() => expect(onDone).not.toHaveBeenCalled());
    expect(screen.getByText(/período cerrado/i)).toBeInTheDocument();
  });

  it("en un banco ofrece los métodos que no son Efectivo", async () => {
    const user = userEvent.setup();

    renderModal({ account: account({ type: "BANK_ACCOUNT", bankName: "BCP" }) });

    await waitFor(() => expect(mock.getLastClose).toHaveBeenCalled());
    await user.click(screen.getByLabelText("Método"));

    expect(
      await screen.findByRole("option", { name: "Transferencia BCP" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Efectivo" })
    ).not.toBeInTheDocument();
  });
});
