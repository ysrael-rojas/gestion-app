import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  CASH_ACCOUNT_FORM_ID,
  CashAccountForm,
} from "@/components/cajas-bancos/cash-account-form";

describe("CashAccountForm", () => {
  it("empieza mostrando los datos básicos sin datos bancarios", () => {
    const onSubmit = vi.fn();

    render(<CashAccountForm onSubmit={onSubmit} />);

    expect(screen.getByLabelText("Nombre")).toBeInTheDocument();
    expect(screen.getByLabelText("Moneda")).toBeInTheDocument();
    expect(screen.getByLabelText("Saldo inicial")).toBeInTheDocument();
    expect(screen.queryByLabelText("Banco")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Nro de cuenta")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("CCI")).not.toBeInTheDocument();
  });

  it("renderiza campos bancarios cuando se pasa defaultType=BANK_ACCOUNT", () => {
    const onSubmit = vi.fn();

    render(<CashAccountForm defaultType="BANK_ACCOUNT" onSubmit={onSubmit} />);

    expect(screen.getByLabelText("Banco")).toBeInTheDocument();
    expect(screen.getByLabelText("Nro de cuenta")).toBeInTheDocument();
    expect(screen.getByLabelText("CCI")).toBeInTheDocument();
  });

  it("pre-rellena los campos cuando se pasa una cuenta", () => {
    const onSubmit = vi.fn();

    render(
      <CashAccountForm
        onSubmit={onSubmit}
        account={{
          id: "1",
          type: "BANK_ACCOUNT",
          name: "Cuenta BCP Soles",
          currency: "PEN",
          bankName: "BCP",
          accountNumber: "123-456",
          cci: "00212300456789012345",
          closingPeriodicity: null,
          openingBalance: 1500,
          openingBalanceDate: "2025-01-15",
          notes: "Cuenta principal",
          isActive: true,
          isPettyCash: false,
          changeFund: 0,
          pettyExpenseLimit: null,
          custodianName: null,
          createdAt: "2025-01-15T00:00:00Z",
          updatedAt: "2025-01-15T00:00:00Z",
          deletedAt: null,
        }}
      />
    );

    expect(screen.getByLabelText("Nombre")).toHaveValue("Cuenta BCP Soles");
    expect(screen.getByLabelText("Banco")).toHaveValue("BCP");
    expect(screen.getByLabelText("Nro de cuenta")).toHaveValue("123-456");
    expect(screen.getByLabelText("CCI")).toHaveValue("00212300456789012345");
    expect(screen.getByLabelText("Saldo inicial")).toHaveValue(1500);
  });
});

describe("CashAccountForm — caja chica", () => {
  it("muestra la sección de caja chica solo en una caja", () => {
    render(<CashAccountForm defaultType="BANK_ACCOUNT" onSubmit={vi.fn()} />);

    expect(screen.queryByLabelText("Fondo de cambio (S/)")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: "Es caja chica" })
    ).not.toBeInTheDocument();
  });

  it("pide límite y custodio al marcar la caja como caja chica", async () => {
    const user = userEvent.setup();

    render(<CashAccountForm defaultType="CASH_BOX" onSubmit={vi.fn()} />);

    expect(screen.getByLabelText("Fondo de cambio (S/)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Límite por gasto (S/)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Custodio")).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Es caja chica" }));

    expect(await screen.findByLabelText("Límite por gasto (S/)")).toBeInTheDocument();
    expect(screen.getByLabelText("Custodio")).toBeInTheDocument();
  });

  it("envía los datos de caja chica al guardar", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <>
        <CashAccountForm defaultType="CASH_BOX" onSubmit={onSubmit} />
        <button type="submit" form={CASH_ACCOUNT_FORM_ID}>
          Guardar
        </button>
      </>
    );

    await user.type(screen.getByLabelText("Nombre"), "Caja chica administración");
    await user.type(screen.getByLabelText("Fondo de cambio (S/)"), "300");
    await user.click(screen.getByRole("checkbox", { name: "Es caja chica" }));
    await user.type(
      await screen.findByLabelText("Límite por gasto (S/)"),
      "50"
    );
    await user.type(screen.getByLabelText("Custodio"), "Ana Ríos");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      type: "CASH_BOX",
      name: "Caja chica administración",
      isPettyCash: true,
      changeFund: 300,
      pettyExpenseLimit: 50,
      custodianName: "Ana Ríos",
    });
  });

  it("no guarda una caja chica sin fondo", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(
      <>
        <CashAccountForm defaultType="CASH_BOX" onSubmit={onSubmit} />
        <button type="submit" form={CASH_ACCOUNT_FORM_ID}>
          Guardar
        </button>
      </>
    );

    await user.type(screen.getByLabelText("Nombre"), "Caja chica");
    await user.click(screen.getByRole("checkbox", { name: "Es caja chica" }));
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
    expect(
      screen.getByText("Una caja chica necesita un fondo mayor a cero.")
    ).toBeInTheDocument();
  });
});