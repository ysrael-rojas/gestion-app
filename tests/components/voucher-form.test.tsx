import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { CLIENTS, SUPPLIERS, SERIES } = vi.hoisted(() => ({
  CLIENTS: [
    {
      id: "c-ruc",
      documentType: "RUC" as const,
      documentNumber: "20123456789",
      name: "Distribuidora Norte SAC",
      address: "Av. Los Álamos 123, Lima",
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
  SERIES: [
    {
      id: "s-factura",
      voucherType: "FACTURA" as const,
      code: "F001",
      lastNumber: 0,
      isDefault: true,
      deletedAt: null,
    },
    {
      id: "s-boleta",
      voucherType: "BOLETA" as const,
      code: "B001",
      lastNumber: 5,
      isDefault: true,
      deletedAt: null,
    },
    {
      id: "s-nota",
      voucherType: "NOTA_VENTA" as const,
      code: "NV01",
      lastNumber: 0,
      isDefault: true,
      deletedAt: null,
    },
  ],
}));

vi.mock("@/lib/comprobantes/series", () => ({
  listSeries: vi.fn(async () => SERIES),
  suggestVoucherNumber: (series: { code: string; lastNumber: number }) =>
    `${series.code}-${String(series.lastNumber + 1).padStart(6, "0")}`,
  advanceSeriesNumber: vi.fn(),
  createSeries: vi.fn(),
  updateSeries: vi.fn(),
  softDeleteSeries: vi.fn(),
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
import { listSeries } from "@/lib/comprobantes/series";

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

function expectRequiredMark(label: string) {
  const labelElement = screen.getByText(label);
  const badge = labelElement.parentElement?.querySelector(
    '[data-slot="badge"]'
  );

  expect(badge).not.toBeNull();
  expect(badge?.textContent).toBe("Requerido");
  expect(badge?.className).toContain("text-destructive");
}

describe("VoucherForm — SPEC 44: requeridos y dirección", () => {
  it("marca con asterisco rojo los campos requeridos", async () => {
    renderForm("VENTA", null);
    await screen.findByPlaceholderText("Buscar cliente...");

    expectRequiredMark("Tipo de comprobante");
    expectRequiredMark("Nro comprobante");
    expectRequiredMark("Cliente");
    expectRequiredMark("Total");
    expectRequiredMark("Condición");
  });

  it("mantiene el ítem 'Selecciona un tipo' en la lista aunque haya selección", async () => {
    renderForm("VENTA", null);

    const user = await pickEntity(
      "Buscar cliente...",
      "Distribuidora Norte SAC"
    );

    expect(await screen.findByText("Factura")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Tipo de comprobante"));

    expect(
      await screen.findByRole("option", { name: "Selecciona un tipo" })
    ).toBeInTheDocument();
  });

  it("muestra el error rojo al enviar sin tipo de comprobante", async () => {
    const user = userEvent.setup();
    renderForm("VENTA", null);

    await screen.findByPlaceholderText("Buscar cliente...");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      await screen.findByText("Selecciona el tipo de comprobante")
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Tipo de comprobante")).toHaveAttribute(
      "aria-invalid",
      "true"
    );
  });

  it("muestra la dirección del cliente en solo lectura", async () => {
    renderForm("VENTA", null);

    await pickEntity("Buscar cliente...", "Distribuidora Norte SAC");

    expect(await screen.findByLabelText("Dirección")).toHaveValue(
      "Av. Los Álamos 123, Lima"
    );
    expect(screen.getByLabelText("Dirección")).toHaveAttribute("readonly");
  });
});

describe("VoucherForm — SPEC 44: sugerencia de numeración", () => {
  beforeEach(() => {
    vi.mocked(listSeries).mockReset();
    vi.mocked(listSeries).mockImplementation(async () => SERIES);
  });

  it("sugiere la serie por defecto según el tipo autoseleccionado", async () => {
    renderForm("VENTA", null);

    await pickEntity("Buscar cliente...", "Distribuidora Norte SAC");

    expect(await screen.findByDisplayValue("F001-000001")).toBeInTheDocument();
  });

  it("sugiere el correlativo siguiente de la serie de boleta", async () => {
    renderForm("VENTA", null);

    await pickEntity("Buscar cliente...", "Bodega María");

    expect(await screen.findByDisplayValue("B001-000006")).toBeInTheDocument();
  });

  it("recalcula la sugerencia al cambiar de tipo", async () => {
    renderForm("VENTA", null);

    const user = await pickEntity(
      "Buscar cliente...",
      "Distribuidora Norte SAC"
    );

    await screen.findByDisplayValue("F001-000001");

    await user.click(screen.getByLabelText("Tipo de comprobante"));
    await user.click(await screen.findByRole("option", { name: "Boleta" }));

    expect(await screen.findByDisplayValue("B001-000006")).toBeInTheDocument();
  });

  it("deshabilita los tipos sin serie por defecto y muestra el hint", async () => {
    vi.mocked(listSeries).mockResolvedValueOnce(
      SERIES.filter((item) => item.voucherType !== "NOTA_VENTA")
    );

    renderForm("VENTA", null);

    const user = await pickEntity("Buscar cliente...", "Bodega María");

    await user.click(screen.getByLabelText("Tipo de comprobante"));

    const notaVentaOption = await screen.findByRole("option", {
      name: "Nota de venta",
    });

    expect(notaVentaOption).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.getByText(
        /Configura una serie por defecto para Nota de venta en Configuración/
      )
    ).toBeInTheDocument();
  });

  it("muestra un banner cuando no hay ninguna serie de venta", async () => {
    vi.mocked(listSeries).mockResolvedValueOnce([]);

    renderForm("VENTA", null);

    expect(
      await screen.findByText(/Aún no tienes series de venta configuradas/)
    ).toBeInTheDocument();
  });

  it("no reemplaza el número al editar una venta existente", async () => {
    renderForm("VENTA", baseVoucher({ voucherNumber: "F001-000042" }));

    await screen.findByPlaceholderText("Buscar cliente...");

    expect(screen.getByLabelText("Nro comprobante")).toHaveValue(
      "F001-000042"
    );
  });

  it("no sugiere numeración en compras", async () => {
    renderForm("COMPRA", null);

    await pickEntity("Buscar proveedor...", "Ferretería El Sol EIRL");

    expect(screen.getByLabelText("Nro comprobante")).toHaveValue("");
  });
});
