import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { CLIENTS, SUPPLIERS } = vi.hoisted(() => ({
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
  listClients: vi.fn(async () => CLIENTS),
  listSuppliers: vi.fn(async () => SUPPLIERS),
  createClientRecord: vi.fn(),
  updateClientRecord: vi.fn(),
  softDeleteClient: vi.fn(),
}));

import { ClientesProvider } from "@/components/clientes/clientes-provider";
import type { Voucher, VoucherKind } from "@/components/comprobantes/types";
import {
  VOUCHER_FORM_ID,
  VoucherForm,
} from "@/components/comprobantes/voucher-form";

const baseVoucher = (overrides: Partial<Voucher> = {}): Voucher => ({
  id: "v-1",
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

function renderForm(voucherKind: VoucherKind, voucher: Voucher | null) {
  const onSubmit = vi.fn();

  render(
    <ClientesProvider>
      <VoucherForm
        voucherKind={voucherKind}
        voucher={voucher}
        onSubmit={onSubmit}
      />
      <button type="submit" form={VOUCHER_FORM_ID}>
        Guardar
      </button>
    </ClientesProvider>
  );

  return onSubmit;
}

async function pickEntity(placeholder: string, name: string) {
  const user = userEvent.setup();
  const input = await screen.findByPlaceholderText(placeholder);

  await user.click(input);
  await user.click(await screen.findByText(name));

  return user;
}

describe("VoucherForm — venta: tipo de comprobante según el documento", () => {
  it("precarga Factura al elegir un cliente con RUC", async () => {
    renderForm("VENTA", null);

    await pickEntity("Buscar cliente...", "Distribuidora Norte SAC");

    expect(await screen.findByText("Factura")).toBeInTheDocument();
    expect(
      screen.queryByText("Para emitir factura, el cliente debe tener RUC.")
    ).not.toBeInTheDocument();
  });

  it("precarga Boleta y bloquea Factura cuando el cliente no tiene RUC", async () => {
    renderForm("VENTA", null);

    await pickEntity("Buscar cliente...", "Bodega María");

    expect(await screen.findByText("Boleta")).toBeInTheDocument();
    expect(
      screen.getByText("Para emitir factura, el cliente debe tener RUC.")
    ).toBeInTheDocument();
  });

  it("precarga Boleta cuando el cliente no tiene documento (SIN_DOCUMENTO)", async () => {
    renderForm("VENTA", null);

    await pickEntity("Buscar cliente...", "Cliente sin documento");

    expect(await screen.findByText("Boleta")).toBeInTheDocument();
    expect(
      screen.getByText("Para emitir factura, el cliente debe tener RUC.")
    ).toBeInTheDocument();
  });

  it("rechaza guardar una factura cuyo cliente no tiene RUC (dato histórico)", async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm(
      "VENTA",
      baseVoucher({ entityId: "c-dni" })
    );

    await screen.findByPlaceholderText("Buscar cliente...");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      await screen.findByText("No se puede emitir factura a un cliente sin RUC")
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("deshabilita la opción Factura en el selector cuando el cliente no tiene RUC", async () => {
    renderForm("VENTA", null);

    const user = await pickEntity("Buscar cliente...", "Bodega María");

    await user.click(screen.getByLabelText("Tipo de comprobante"));

    const facturaOption = await screen.findByRole("option", {
      name: "Factura",
    });

    expect(facturaOption).toHaveAttribute("aria-disabled", "true");
  });
});

describe("VoucherForm — compra: proveedores y tipo sugerido", () => {
  it("sugiere Factura cuando el proveedor tiene RUC", async () => {
    renderForm("COMPRA", null);

    await pickEntity("Buscar proveedor...", "Ferretería El Sol EIRL");

    expect(await screen.findByText("Factura")).toBeInTheDocument();
  });

  it("sugiere Boleta con proveedor sin RUC pero deja el tipo libre", async () => {
    renderForm("COMPRA", null);

    const user = await pickEntity("Buscar proveedor...", "Transportes Juan");

    expect(await screen.findByText("Boleta")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Tipo de comprobante"));

    const facturaOption = await screen.findByRole("option", {
      name: "Factura",
    });

    expect(facturaOption).not.toHaveAttribute("aria-disabled", "true");
    expect(facturaOption).not.toHaveAttribute("data-disabled");
  });
});

describe("VoucherForm — inmutabilidad con pagos", () => {
  it("bloquea importe, número, cliente y fecha en ventas con pagos", async () => {
    renderForm("VENTA", baseVoucher({ paidAmount: 30, balance: 70 }));

    await screen.findByPlaceholderText("Buscar cliente...");

    expect(screen.getByLabelText("Fecha de emisión")).toBeDisabled();
    expect(screen.getByLabelText("Nro comprobante")).toBeDisabled();
    expect(screen.getByLabelText("Total")).toBeDisabled();
    expect(screen.getByPlaceholderText("Buscar cliente...")).toBeDisabled();
    expect(
      screen.getByText(/Este comprobante tiene pagos registrados/)
    ).toBeInTheDocument();
  });

  it("bloquea importe, número, proveedor y fecha en compras con pagos", async () => {
    renderForm(
      "COMPRA",
      baseVoucher({ entityId: "sup-ruc", paidAmount: 20, balance: 80 })
    );

    await screen.findByPlaceholderText("Buscar proveedor...");

    expect(screen.getByLabelText("Fecha de emisión")).toBeDisabled();
    expect(screen.getByLabelText("Nro comprobante")).toBeDisabled();
    expect(screen.getByLabelText("Total")).toBeDisabled();
    expect(screen.getByPlaceholderText("Buscar proveedor...")).toBeDisabled();
    expect(
      screen.getByText(/Este comprobante tiene pagos registrados/)
    ).toBeInTheDocument();
  });

  it("no bloquea nada en ventas sin pagos", async () => {
    renderForm("VENTA", baseVoucher());

    await screen.findByPlaceholderText("Buscar cliente...");

    expect(screen.getByLabelText("Fecha de emisión")).not.toBeDisabled();
    expect(screen.getByLabelText("Nro comprobante")).not.toBeDisabled();
    expect(screen.getByLabelText("Total")).not.toBeDisabled();
    expect(
      screen.queryByText(/Este comprobante tiene pagos registrados/)
    ).not.toBeInTheDocument();
  });

  it("no bloquea nada en compras sin pagos", async () => {
    renderForm("COMPRA", baseVoucher({ entityId: "sup-ruc" }));

    await screen.findByPlaceholderText("Buscar proveedor...");

    expect(screen.getByLabelText("Fecha de emisión")).not.toBeDisabled();
    expect(screen.getByLabelText("Nro comprobante")).not.toBeDisabled();
    expect(screen.getByLabelText("Total")).not.toBeDisabled();
    expect(
      screen.queryByText(/Este comprobante tiene pagos registrados/)
    ).not.toBeInTheDocument();
  });
});

describe("VoucherForm — montos derivados", () => {
  it("calcula subtotal e IGV a partir del total", async () => {
    const user = userEvent.setup();
    renderForm("VENTA", null);

    const totalInput = await screen.findByLabelText("Total");
    await user.type(totalInput, "118");

    const subtotalInput = screen.getByLabelText(
      "Subtotal (solo lectura)"
    ) as HTMLInputElement;
    const igvInput = screen.getByLabelText(
      "IGV 18 % (solo lectura)"
    ) as HTMLInputElement;

    expect(subtotalInput.value).toContain("100.00");
    expect(igvInput.value).toContain("18.00");
  });
});
