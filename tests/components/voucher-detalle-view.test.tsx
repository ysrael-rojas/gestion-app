import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  listVoucherAdjustments,
  getPaymentHistory,
  useVoucher,
  reload,
  listSuppliers,
} = vi.hoisted(() => ({
  listVoucherAdjustments: vi.fn(),
  getPaymentHistory: vi.fn(),
  useVoucher: vi.fn(),
  reload: vi.fn(),
  listSuppliers: vi.fn(),
}));

vi.mock("@/lib/comprobantes/notas", () => ({ listVoucherAdjustments }));
vi.mock("@/lib/pagos/pagos", () => ({ getPaymentHistory }));
vi.mock("@/components/comprobantes/use-voucher", () => ({ useVoucher }));
vi.mock("@/lib/clientes/entidades", () => ({ listSuppliers }));
vi.mock("@/components/comprobantes/payment-drawer", () => ({
  PaymentDrawer: () => <p>wizard stub</p>,
}));
vi.mock("@/components/pagos/receipt-dialog", () => ({
  ReceiptDialog: () => null,
}));
vi.mock("@/components/clientes/clientes-provider", () => ({
  useClientes: () => ({ clients: [], isLoading: false }),
}));
vi.mock("@/components/ventas/ventas-provider", () => ({
  useVentas: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/components/compras/compras-provider", () => ({
  useCompras: () => ({ refresh: vi.fn() }),
}));

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VoucherDetalleView } from "@/components/comprobantes/voucher-detalle-view";
import type { Client } from "@/components/clientes/types";
import type { Voucher } from "@/components/comprobantes/types";
import type { PaymentHistoryEntry } from "@/components/pagos/types";
import type { VoucherAdjustment } from "@/lib/comprobantes/notas";

const voucher = (overrides: Partial<Voucher> = {}): Voucher => ({
  id: "v-1",
  issueDate: "2026-10-01",
  registrationDate: "2026-10-01",
  voucherType: "FACTURA",
  voucherNumber: "F001-000001",
  entityId: "e-1",
  subtotal: 847.46,
  igv: 152.54,
  total: 1000,
  paymentType: "CREDITO",
  creditDays: 30,
  dueDate: "2026-10-31",
  status: "PENDIENTE",
  paidAmount: 300,
  balance: 700,
  ...overrides,
});

const note = (
  overrides: Partial<VoucherAdjustment> = {}
): VoucherAdjustment => ({
  id: "a-1",
  voucherType: "NOTA_CREDITO",
  voucherNumber: "FC01-000001",
  issueDate: "2026-10-17",
  motiveCode: "01",
  total: 10,
  ...overrides,
});

const historyEntry = (
  overrides: Partial<PaymentHistoryEntry> = {}
): PaymentHistoryEntry => ({
  allocationId: "al-1",
  paymentId: "p-1",
  receiptNumber: "RI-000001",
  paymentDate: "2026-10-10",
  direction: "INGRESO",
  methodName: "Efectivo",
  cashAccountName: "Caja principal",
  categoryName: "Cobranza de venta",
  reference: null,
  paymentAmount: 100,
  amount: 100,
  status: "EN_REVISION",
  voidedAt: null,
  voidReason: null,
  notes: null,
  ...overrides,
});

const supplier = (overrides: Partial<Client> = {}): Client => ({
  id: "e-1",
  documentType: "RUC",
  documentNumber: "20501122334",
  name: "AGROINDUSTRIAL TRUJILLO SAC",
  address: "",
  phone: "",
  contactName: "",
  billingEmail: "",
  managementEmail: "",
  isSupplier: true,
  ...overrides,
});

function renderView(kind: "VENTA" | "COMPRA") {
  return render(<VoucherDetalleView voucherKind={kind} voucherId="v-1" />);
}

function tabButtons() {
  return within(
    screen.getByRole("group", { name: "Secciones del comprobante" })
  ).getAllByRole("button");
}

function tabButton(name: RegExp | string) {
  return within(
    screen.getByRole("group", { name: "Secciones del comprobante" })
  ).getByRole("button", { name });
}

function countOf(tab: HTMLElement) {
  return tab.querySelector<HTMLElement>('[data-testid="tab-count"]');
}

describe("VoucherDetalleView", () => {
  beforeEach(() => {
    listVoucherAdjustments.mockReset();
    getPaymentHistory.mockReset();
    reload.mockReset();
    listSuppliers.mockReset();
    listVoucherAdjustments.mockResolvedValue([]);
    getPaymentHistory.mockResolvedValue([]);
    listSuppliers.mockResolvedValue([]);
    useVoucher.mockReturnValue({
      voucher: voucher(),
      isLoading: false,
      error: null,
      reload,
    });
  });

  it("muestra los 4 tabs con icono y sin chip en Datos", async () => {
    renderView("VENTA");

    await waitFor(() => {
      expect(listVoucherAdjustments).toHaveBeenCalledWith("v-1");
      expect(getPaymentHistory).toHaveBeenCalledWith("v-1");
    });

    const tabs = tabButtons();
    expect(tabs).toHaveLength(4);
    expect(tabButton("Datos")).toBeInTheDocument();
    expect(countOf(tabButton("Datos"))).toBeNull();

    tabs.forEach((tab) => {
      expect(tab.querySelector("svg")).not.toBeNull();
    });
  });

  it("muestra el chip de conteo en pagos cuando el historial tiene filas, aunque el pago esté anulado", async () => {
    // Caso real: el único pago está anulado → paidAmount 0 pero el historial
    // sí lista filas (SPEC 43, corrección posterior).
    useVoucher.mockReturnValue({
      voucher: voucher({ status: "PENDIENTE", paidAmount: 0, balance: 1000 }),
      isLoading: false,
      error: null,
      reload,
    });
    getPaymentHistory.mockResolvedValue([historyEntry({ status: "ANULADO" })]);

    renderView("VENTA");

    const pagos = tabButton(/Historial de pagos/);
    await waitFor(() => {
      expect(countOf(pagos)).toHaveTextContent("1");
    });
  });

  it("sin filas en el historial no hay chip en pagos", async () => {
    useVoucher.mockReturnValue({
      voucher: voucher({ paidAmount: 0, balance: 1000 }),
      isLoading: false,
      error: null,
      reload,
    });

    renderView("VENTA");

    await waitFor(() => {
      expect(getPaymentHistory).toHaveBeenCalled();
    });

    expect(countOf(tabButton(/Historial de pagos/))).toBeNull();
  });

  it("marca pagos en rose y pone chips de conteo en notas y retenciones", async () => {
    listVoucherAdjustments.mockResolvedValue([
      note(),
      note({ id: "a-2", voucherType: "COMPROBANTE_RETENCION", total: 30 }),
    ]);
    getPaymentHistory.mockResolvedValue([historyEntry()]);

    renderView("VENTA");

    const pagos = tabButton(/Historial de pagos/);
    await waitFor(() => {
      expect(countOf(pagos)).toHaveTextContent("1");
    });
    expect(pagos).toHaveClass("text-rose-600");

    expect(countOf(tabButton(/Notas/))).toHaveTextContent("1");
    expect(countOf(tabButton(/Retenciones/))).toHaveTextContent("1");
  });

  it("el chip de pagos cuenta todas las filas, incluidas las anuladas", async () => {
    getPaymentHistory.mockResolvedValue([
      historyEntry({ allocationId: "al-1", paymentId: "p-1" }),
      historyEntry({ allocationId: "al-2", paymentId: "p-2" }),
      historyEntry({
        allocationId: "al-3",
        paymentId: "p-3",
        status: "ANULADO",
      }),
    ]);

    renderView("VENTA");

    await waitFor(() => {
      expect(countOf(tabButton(/Historial de pagos/))).toHaveTextContent("3");
    });
  });

  it("el chip de notas unifica NC y ND y retenciones lleva su propio conteo", async () => {
    listVoucherAdjustments.mockResolvedValue([
      note(),
      note({ id: "a-2", voucherType: "NOTA_DEBITO", voucherNumber: "FD01-000001" }),
      note({ id: "a-3", voucherType: "COMPROBANTE_RETENCION", total: 30 }),
    ]);

    renderView("VENTA");

    await waitFor(() => {
      expect(countOf(tabButton(/Notas/))).toHaveTextContent("2");
    });
    expect(countOf(tabButton(/Retenciones/))).toHaveTextContent("1");
  });

  it("en el pill activo el chip usa el tratamiento contrastante", async () => {
    getPaymentHistory.mockResolvedValue([historyEntry()]);
    renderView("VENTA");

    await userEvent.click(tabButton(/Historial de pagos/));

    const chip = countOf(tabButton(/Historial de pagos/));
    expect(chip).toHaveClass("bg-white/20");
    expect(chip).toHaveClass("text-white");
  });

  it("el pill activo de pagos pendiente es rojo con la misma forma que los demás", async () => {
    getPaymentHistory.mockResolvedValue([historyEntry()]);
    renderView("VENTA");

    await userEvent.click(tabButton(/Historial de pagos/));

    const pagos = tabButton(/Historial de pagos/);
    expect(pagos).toHaveClass(/bg-rose-600/);
    expect(pagos).toHaveClass(/border-\[3px\]/);
    expect(pagos).toHaveClass(/shadow-\[4px_4px/);
  });

  it("en saldado el tab de pagos pasa a emerald (también con saldo negativo)", () => {
    useVoucher.mockReturnValue({
      voucher: voucher({ status: "PAGADO", balance: -50, paidAmount: 1000 }),
      isLoading: false,
      error: null,
      reload,
    });

    renderView("VENTA");

    expect(tabButton(/Historial de pagos/)).toHaveClass("text-emerald-600");
  });

  it("muestra la card de datos con su título por defecto", () => {
    renderView("VENTA");

    expect(screen.getByText("Datos del comprobante")).toBeInTheDocument();
    expect(screen.getByText("Fecha de emisión")).toBeInTheDocument();
  });

  it("lista las notas al abrir su tab", async () => {
    listVoucherAdjustments.mockResolvedValue([note()]);
    renderView("VENTA");

    await userEvent.click(tabButton(/Notas/));

    expect(await screen.findByText("FC01-000001")).toBeInTheDocument();
    expect(screen.getByText("Notas de crédito").parentElement).toHaveTextContent(
      /10\.00/
    );
  });

  it("el historial lista las filas cargadas por la vista", async () => {
    getPaymentHistory.mockResolvedValue([historyEntry()]);
    renderView("VENTA");

    await userEvent.click(tabButton(/Historial de pagos/));

    expect(await screen.findByText("RI-000001")).toBeInTheDocument();
  });

  it("en compras el tab de retenciones explica el vacío", async () => {
    renderView("COMPRA");

    await userEvent.click(tabButton("Retenciones"));

    expect(
      await screen.findByText(/hoy solo se reciben sobre ventas/i)
    ).toBeInTheDocument();
  });

  it("compras comparte el mismo modelo: 4 pills, chip y estado del pago", async () => {
    useVoucher.mockReturnValue({
      voucher: voucher({ paidAmount: 100, balance: 400 }),
      isLoading: false,
      error: null,
      reload,
    });
    getPaymentHistory.mockResolvedValue([
      historyEntry({ direction: "EGRESO", status: "ANULADO" }),
    ]);
    listVoucherAdjustments.mockResolvedValue([]);

    renderView("COMPRA");

    expect(tabButtons()).toHaveLength(4);

    const pagos = tabButton(/Historial de pagos/);
    await waitFor(() => {
      expect(countOf(pagos)).toHaveTextContent("1");
    });
    expect(pagos).toHaveClass("text-rose-600");

    await userEvent.click(pagos);
    expect(pagos).toHaveClass(/bg-rose-600/);

    expect(screen.queryByText("Datos del comprobante")).not.toBeInTheDocument();
    expect(
      await screen.findByText("RI-000001")
    ).toBeInTheDocument();
  });

  it("en compras resuelve el nombre del proveedor", async () => {
    listSuppliers.mockResolvedValue([supplier()]);

    renderView("COMPRA");

    expect(
      await screen.findByText("Proveedor: AGROINDUSTRIAL TRUJILLO SAC")
    ).toBeInTheDocument();
    expect(listSuppliers).toHaveBeenCalledTimes(1);
  });

  it("en compras con proveedor desconocido mantiene el fallback", async () => {
    renderView("COMPRA");

    expect(
      await screen.findByText("Proveedor: Proveedor no encontrado")
    ).toBeInTheDocument();
  });

  it("en ventas no consulta proveedores y resuelve contra clientes", async () => {
    renderView("VENTA");

    await waitFor(() => {
      expect(getPaymentHistory).toHaveBeenCalled();
    });

    expect(listSuppliers).not.toHaveBeenCalled();
    expect(screen.getByText("Cliente: Cliente no encontrado")).toBeInTheDocument();
  });
});
