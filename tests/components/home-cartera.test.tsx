import { beforeEach, describe, expect, it, vi } from "vitest";

const { usePagos, useClientes, listOpenVouchers, listSuppliers } = vi.hoisted(
  () => ({
    usePagos: vi.fn(),
    useClientes: vi.fn(),
    listOpenVouchers: vi.fn(),
    listSuppliers: vi.fn(),
  })
);

vi.mock("@/components/pagos/pagos-provider", () => ({ usePagos }));
vi.mock("@/components/clientes/clientes-provider", () => ({ useClientes }));
vi.mock("@/lib/pagos/cartera", () => ({ listOpenVouchers }));
vi.mock("@/lib/clientes/entidades", () => ({ listSuppliers }));

import { render, screen } from "@testing-library/react";

import Home from "@/app/(app)/page";
import type { Client } from "@/components/clientes/types";
import type { CarteraBucket } from "@/components/cartera/types";
import type { VoucherBalance } from "@/components/pagos/types";

const bucket: CarteraBucket = {
  count: 0,
  amount: 0,
  overdueCount: 0,
  overdueAmount: 0,
};

const summary = {
  receivable: bucket,
  payable: bucket,
  unassignedReceipts: bucket,
  unassignedPayments: bucket,
};

const client: Client = {
  id: "cli-1",
  documentType: "RUC",
  documentNumber: "20480123456",
  name: "DISTRIBUIDORA SAN MARTIN SAC",
  address: "",
  phone: "",
  contactName: "",
  billingEmail: "",
  managementEmail: "",
};

const supplier: Client = {
  id: "sup-1",
  documentType: "RUC",
  documentNumber: "20501122334",
  name: "AGROINDUSTRIAL TRUJILLO SAC",
  address: "",
  phone: "",
  contactName: "",
  billingEmail: "",
  managementEmail: "",
  isSupplier: true,
};

const saleVoucher: VoucherBalance = {
  comprobanteId: "c-1",
  entityId: "cli-1",
  voucherKind: "VENTA",
  voucherType: "FACTURA",
  voucherNumber: "FV01-000001",
  issueDate: "2026-10-01",
  effectiveDueDate: "2020-01-01",
  paymentType: "CREDITO",
  total: 1000,
  paidAmount: 0,
  balance: 1000,
};

const purchaseVoucher: VoucherBalance = {
  comprobanteId: "b-1",
  entityId: "sup-1",
  voucherKind: "COMPRA",
  voucherType: "FACTURA",
  voucherNumber: "F001-00121",
  issueDate: "2026-10-01",
  effectiveDueDate: "2020-01-01",
  paymentType: "CREDITO",
  total: 2950,
  paidAmount: 0,
  balance: 2950,
};

describe("Resumen de cartera", () => {
  beforeEach(() => {
    usePagos.mockReset();
    useClientes.mockReset();
    listOpenVouchers.mockReset();
    listSuppliers.mockReset();

    usePagos.mockReturnValue({ summary, isSummaryLoading: false });
    useClientes.mockReturnValue({ clients: [client], isLoading: false });
    listOpenVouchers.mockImplementation(
      (direction: "INGRESO" | "EGRESO") =>
        Promise.resolve(direction === "INGRESO" ? [saleVoucher] : [purchaseVoucher])
    );
    listSuppliers.mockResolvedValue([supplier]);
  });

  it("resuelve el proveedor en los vencidos por pagar y el cliente en los vencidos por cobrar", async () => {
    render(<Home />);

    expect(
      await screen.findByText(/AGROINDUSTRIAL TRUJILLO SAC/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/DISTRIBUIDORA SAN MARTIN SAC/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Entidad no encontrada/)).not.toBeInTheDocument();
  });

  it("si no llegan proveedores mantiene el fallback de los vencidos por pagar", async () => {
    listSuppliers.mockResolvedValue([]);

    render(<Home />);

    expect(await screen.findByText(/Entidad no encontrada/)).toBeInTheDocument();
    expect(
      screen.getByText(/DISTRIBUIDORA SAN MARTIN SAC/)
    ).toBeInTheDocument();
  });
});
