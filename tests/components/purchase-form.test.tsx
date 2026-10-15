import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { SUPPLIERS } = vi.hoisted(() => ({
  SUPPLIERS: [
    {
      id: "sup-ruc",
      documentType: "RUC" as const,
      documentNumber: "20481234567",
      name: "Ferretería El Sol EIRL",
      address: "",
      phone: "",
      contactName: "",
      billingEmail: "",
      managementEmail: "",
    },
    {
      id: "sup-dni",
      documentType: "DNI" as const,
      documentNumber: "87654321",
      name: "Transportes Juan",
      address: "",
      phone: "",
      contactName: "",
      billingEmail: "",
      managementEmail: "",
    },
  ],
}));

vi.mock("@/lib/clientes/entidades", () => ({
  listSuppliers: vi.fn(async () => SUPPLIERS),
  listClients: vi.fn(async () => []),
  createClientRecord: vi.fn(),
  updateClientRecord: vi.fn(),
  softDeleteClient: vi.fn(),
}));

import {
  PURCHASE_FORM_ID,
  PurchaseForm,
} from "@/components/compras/purchase-form";
import type { Purchase } from "@/components/compras/types";

const basePurchase = (overrides: Partial<Purchase> = {}): Purchase => ({
  id: "p-1",
  issueDate: "2026-10-01",
  registrationDate: "2026-10-01",
  voucherType: "FACTURA",
  voucherNumber: "F001-000001",
  supplierId: "sup-ruc",
  subtotal: 84.75,
  igv: 15.25,
  total: 100,
  paymentType: "CONTADO",
  creditDays: null,
  dueDate: null,
  status: "PENDIENTE",
  paidAmount: 0,
  balance: 100,
  ...overrides,
});

function renderForm(purchase: Purchase | null) {
  const onSubmit = vi.fn();

  render(
    <>
      <PurchaseForm purchase={purchase} onSubmit={onSubmit} />
      <button type="submit" form={PURCHASE_FORM_ID}>
        Guardar
      </button>
    </>
  );

  return onSubmit;
}

async function pickSupplier(name: string) {
  const user = userEvent.setup();
  const input = await screen.findByPlaceholderText("Buscar proveedor...");

  await user.click(input);
  await user.click(await screen.findByText(name));

  return user;
}

describe("PurchaseForm — tipo de comprobante sugerido por el proveedor", () => {
  it("sugiere Factura cuando el proveedor tiene RUC", async () => {
    renderForm(null);

    await pickSupplier("Ferretería El Sol EIRL");

    expect(await screen.findByText("Factura")).toBeInTheDocument();
  });

  it("sugiere Boleta con proveedor sin RUC pero deja el tipo libre", async () => {
    renderForm(null);

    const user = await pickSupplier("Transportes Juan");

    expect(await screen.findByText("Boleta")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Tipo de comprobante"));

    const facturaOption = await screen.findByRole("option", {
      name: "Factura",
    });

    expect(facturaOption).not.toHaveAttribute("aria-disabled", "true");
    expect(facturaOption).not.toHaveAttribute("data-disabled");
  });
});

describe("PurchaseForm — inmutabilidad con pagos", () => {
  it("bloquea importe, número, proveedor y fecha cuando el comprobante tiene pagos", async () => {
    renderForm(basePurchase({ paidAmount: 20, balance: 80 }));

    await screen.findByPlaceholderText("Buscar proveedor...");

    expect(screen.getByLabelText("Fecha de emisión")).toBeDisabled();
    expect(screen.getByLabelText("Nro comprobante")).toBeDisabled();
    expect(screen.getByLabelText("Total")).toBeDisabled();
    expect(screen.getByPlaceholderText("Buscar proveedor...")).toBeDisabled();
    expect(
      screen.getByText(/Este comprobante tiene pagos registrados/)
    ).toBeInTheDocument();
  });

  it("no bloquea nada cuando el comprobante no tiene pagos", async () => {
    renderForm(basePurchase());

    await screen.findByPlaceholderText("Buscar proveedor...");

    expect(screen.getByLabelText("Fecha de emisión")).not.toBeDisabled();
    expect(screen.getByLabelText("Nro comprobante")).not.toBeDisabled();
    expect(screen.getByLabelText("Total")).not.toBeDisabled();
    expect(
      screen.queryByText(/Este comprobante tiene pagos registrados/)
    ).not.toBeInTheDocument();
  });
});
