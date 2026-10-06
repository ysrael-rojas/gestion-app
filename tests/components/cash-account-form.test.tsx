import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { CashAccountForm } from "@/components/cajas-bancos/cash-account-form";

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