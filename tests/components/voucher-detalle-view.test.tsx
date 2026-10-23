import { beforeEach, describe, expect, it, vi } from "vitest";

const { listVoucherAdjustments, useVoucher, reload } = vi.hoisted(() => ({
  listVoucherAdjustments: vi.fn(),
  useVoucher: vi.fn(),
  reload: vi.fn(),
}));

vi.mock("@/lib/comprobantes/notas", () => ({ listVoucherAdjustments }));
vi.mock("@/components/comprobantes/use-voucher", () => ({ useVoucher }));
vi.mock("@/components/comprobantes/payment-history-section", () => ({
  PaymentHistorySection: () => <p>historial stub</p>,
}));
vi.mock("@/components/comprobantes/nested-payment-drawers", () => ({
  NestedPaymentDrawers: () => <p>wizard stub</p>,
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
import type { Voucher } from "@/components/comprobantes/types";
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

function handOf(tab: HTMLElement) {
  return tab.querySelector("svg.lucide-hand");
}

describe("VoucherDetalleView", () => {
  beforeEach(() => {
    listVoucherAdjustments.mockReset();
    reload.mockReset();
    useVoucher.mockReturnValue({
      voucher: voucher(),
      isLoading: false,
      error: null,
      reload,
    });
  });

  it("muestra los 4 tabs con icono y sin mano en Datos", async () => {
    listVoucherAdjustments.mockResolvedValue([]);
    renderView("VENTA");

    await waitFor(() => {
      expect(listVoucherAdjustments).toHaveBeenCalledWith("v-1");
    });

    const tabs = tabButtons();
    expect(tabs).toHaveLength(4);
    expect(tabButton("Datos")).toBeInTheDocument();
    expect(handOf(tabButton("Datos"))).toBeNull();

    tabs.forEach((tab) => {
      expect(tab.querySelector("svg")).not.toBeNull();
    });
  });

  it("marca pagos en rose y pone mano cuando hay pagos, notas y retenciones", async () => {
    listVoucherAdjustments.mockResolvedValue([
      note(),
      note({ id: "a-2", voucherType: "COMPROBANTE_RETENCION", total: 30 }),
    ]);
    renderView("VENTA");

    const pagos = tabButton(/Historial de pagos/);
    await waitFor(() => {
      expect(handOf(pagos)).not.toBeNull();
    });
    expect(pagos).toHaveClass("text-rose-600");

    expect(handOf(tabButton(/Notas/))).not.toBeNull();
    expect(handOf(tabButton("Retenciones"))).not.toBeNull();
  });

  it("al abrir pagos pendiente el pill activo es rojo", async () => {
    listVoucherAdjustments.mockResolvedValue([]);
    renderView("VENTA");

    await userEvent.click(tabButton(/Historial de pagos/));

    expect(tabButton(/Historial de pagos/)).toHaveClass(/bg-destructive/);
  });

  it("en saldado el tab de pagos pasa a emerald (también con saldo negativo)", async () => {
    listVoucherAdjustments.mockResolvedValue([]);
    useVoucher.mockReturnValue({
      voucher: voucher({ status: "PAGADO", balance: -50, paidAmount: 1000 }),
      isLoading: false,
      error: null,
      reload,
    });

    renderView("VENTA");

    expect(tabButton(/Historial de pagos/)).toHaveClass("text-emerald-600");
  });

  it("no pone manos cuando no hay registros", async () => {
    listVoucherAdjustments.mockResolvedValue([]);
    useVoucher.mockReturnValue({
      voucher: voucher({ paidAmount: 0, balance: 1000 }),
      isLoading: false,
      error: null,
      reload,
    });

    renderView("VENTA");

    await waitFor(() => {
      expect(listVoucherAdjustments).toHaveBeenCalled();
    });

    tabButtons().forEach((tab) => {
      expect(handOf(tab)).toBeNull();
    });
  });

  it("muestra la card de datos con su título por defecto", () => {
    listVoucherAdjustments.mockResolvedValue([]);
    renderView("VENTA");

    expect(screen.getByText("Datos del comprobante")).toBeInTheDocument();
    expect(screen.getByText("Fecha de emisión")).toBeInTheDocument();
    expect(screen.queryByText("historial stub")).not.toBeInTheDocument();
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

  it("en compras el tab de retenciones explica el vacío", async () => {
    listVoucherAdjustments.mockResolvedValue([]);
    renderView("COMPRA");

    await userEvent.click(tabButton("Retenciones"));

    expect(
      await screen.findByText(/hoy solo se reciben sobre ventas/i)
    ).toBeInTheDocument();
  });
});
