import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { CLIENTS } = vi.hoisted(() => ({
  CLIENTS: [
    {
      id: "c-ruc",
      documentType: "RUC" as const,
      documentNumber: "20123456789",
      name: "Distribuidora Norte SAC",
      address: "",
      phone: "",
      contactName: "",
      billingEmail: "",
      managementEmail: "",
    },
    {
      id: "c-dni",
      documentType: "DNI" as const,
      documentNumber: "12345678",
      name: "Bodega María",
      address: "",
      phone: "",
      contactName: "",
      billingEmail: "",
      managementEmail: "",
    },
    {
      id: "c-sin-doc",
      documentType: "SIN_DOCUMENTO" as const,
      documentNumber: "",
      name: "Cliente sin documento",
      address: "",
      phone: "",
      contactName: "",
      billingEmail: "",
      managementEmail: "",
    },
  ],
}));

vi.mock("@/lib/clientes/entidades", () => ({
  listClients: vi.fn(async () => CLIENTS),
  createClientRecord: vi.fn(),
  updateClientRecord: vi.fn(),
  softDeleteClient: vi.fn(),
}));

import { ClientesProvider } from "@/components/clientes/clientes-provider";
import { SALE_FORM_ID, SaleForm } from "@/components/ventas/sale-form";
import type { Sale } from "@/components/ventas/types";

const baseSale = (overrides: Partial<Sale> = {}): Sale => ({
  id: "s-1",
  issueDate: "2026-10-01",
  registrationDate: "2026-10-01",
  voucherType: "FACTURA",
  voucherNumber: "F001-000001",
  entityId: "c-ruc",
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

function renderForm(sale: Sale | null) {
  const onSubmit = vi.fn();

  render(
    <ClientesProvider>
      <SaleForm sale={sale} onSubmit={onSubmit} />
      <button type="submit" form={SALE_FORM_ID}>
        Guardar
      </button>
    </ClientesProvider>
  );

  return onSubmit;
}

async function pickClient(name: string) {
  const user = userEvent.setup();
  const input = await screen.findByPlaceholderText("Buscar cliente...");

  await user.click(input);
  await user.click(await screen.findByText(name));

  return user;
}

describe("SaleForm — tipo de comprobante según el documento del cliente", () => {
  it("precarga Factura al elegir un cliente con RUC", async () => {
    renderForm(null);

    await pickClient("Distribuidora Norte SAC");

    expect(await screen.findByText("Factura")).toBeInTheDocument();
    expect(
      screen.queryByText("Para emitir factura, el cliente debe tener RUC.")
    ).not.toBeInTheDocument();
  });

  it("precarga Boleta y bloquea Factura cuando el cliente no tiene RUC", async () => {
    renderForm(null);

    await pickClient("Bodega María");

    expect(await screen.findByText("Boleta")).toBeInTheDocument();
    expect(
      screen.getByText("Para emitir factura, el cliente debe tener RUC.")
    ).toBeInTheDocument();
  });

  it("precarga Boleta cuando el cliente no tiene documento (SIN_DOCUMENTO)", async () => {
    renderForm(null);

    await pickClient("Cliente sin documento");

    expect(await screen.findByText("Boleta")).toBeInTheDocument();
    expect(
      screen.getByText("Para emitir factura, el cliente debe tener RUC.")
    ).toBeInTheDocument();
  });

  it("rechaza guardar una factura cuyo cliente no tiene RUC (dato histórico)", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(baseSale({ entityId: "c-dni" }));

    await screen.findByPlaceholderText("Buscar cliente...");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      await screen.findByText("No se puede emitir factura a un cliente sin RUC")
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("deshabilita la opción Factura en el selector cuando el cliente no tiene RUC", async () => {
    renderForm(null);

    const user = await pickClient("Bodega María");

    await user.click(screen.getByLabelText("Tipo de comprobante"));

    const facturaOption = await screen.findByRole("option", {
      name: "Factura",
    });

    expect(facturaOption).toHaveAttribute("aria-disabled", "true");
  });
});

describe("SaleForm — inmutabilidad con pagos", () => {
  it("bloquea importe, número, cliente y fecha cuando el comprobante tiene pagos", async () => {
    renderForm(baseSale({ paidAmount: 30, balance: 70 }));

    await screen.findByPlaceholderText("Buscar cliente...");

    expect(screen.getByLabelText("Fecha de emisión")).toBeDisabled();
    expect(screen.getByLabelText("Nro comprobante")).toBeDisabled();
    expect(screen.getByLabelText("Total")).toBeDisabled();
    expect(screen.getByPlaceholderText("Buscar cliente...")).toBeDisabled();
    expect(
      screen.getByText(/Este comprobante tiene pagos registrados/)
    ).toBeInTheDocument();
  });

  it("no bloquea nada cuando el comprobante no tiene pagos", async () => {
    renderForm(baseSale());

    await screen.findByPlaceholderText("Buscar cliente...");

    expect(screen.getByLabelText("Fecha de emisión")).not.toBeDisabled();
    expect(screen.getByLabelText("Nro comprobante")).not.toBeDisabled();
    expect(screen.getByLabelText("Total")).not.toBeDisabled();
    expect(
      screen.queryByText(/Este comprobante tiene pagos registrados/)
    ).not.toBeInTheDocument();
  });
});
