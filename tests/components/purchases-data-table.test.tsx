import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Client } from "@/components/clientes/types";
import { PurchasesDataTable } from "@/components/compras/purchases-data-table";
import type { Purchase } from "@/components/compras/types";
import type { ListadoFilters } from "@/lib/filters/listado-filters";

const FILTERS: ListadoFilters = { desde: null, hasta: null, estado: "TODOS" };

const supplier = (overrides: Partial<Client> = {}): Client => ({
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
  ...overrides,
});

const purchase = (overrides: Partial<Purchase> = {}): Purchase => ({
  id: "p-1",
  issueDate: "2026-10-21",
  registrationDate: "2026-10-21",
  voucherType: "FACTURA",
  voucherNumber: "F001-00121",
  supplierId: "sup-1",
  subtotal: 2500,
  igv: 450,
  total: 2950,
  paymentType: "CREDITO",
  creditDays: 15,
  dueDate: "2026-11-05",
  status: "PENDIENTE",
  paidAmount: 0,
  balance: 2950,
  ...overrides,
});

function renderTable(
  purchases: Purchase[],
  suppliers: Client[]
): void {
  render(
    <PurchasesDataTable
      purchases={purchases}
      suppliers={suppliers}
      filters={FILTERS}
      onView={vi.fn()}
      onEdit={vi.fn()}
      onRegisterPayment={vi.fn()}
    />
  );
}

describe("PurchasesDataTable", () => {
  it("resuelve el nombre del proveedor desde la lista de proveedores", () => {
    renderTable([purchase()], [supplier()]);

    expect(screen.getByText("AGROINDUSTRIAL TRUJILLO SAC")).toBeInTheDocument();
    expect(screen.queryByText("Proveedor no encontrado")).not.toBeInTheDocument();
  });

  it("cae al fallback cuando el proveedor no está en la lista", () => {
    renderTable([purchase({ supplierId: "sup-inexistente" })], [supplier()]);

    expect(screen.getByText("Proveedor no encontrado")).toBeInTheDocument();
  });

  it("el buscador filtra por nombre de proveedor", async () => {
    renderTable(
      [
        purchase(),
        purchase({
          id: "p-2",
          voucherNumber: "F003-00012",
          supplierId: "sup-2",
        }),
      ],
      [supplier(), supplier({ id: "sup-2", name: "SERVICIOS LOGISTICOS CHIMU SAC" })]
    );

    await userEvent.type(
      screen.getByPlaceholderText("Buscar compras..."),
      "AGROINDUSTRIAL"
    );

    expect(screen.getByText("AGROINDUSTRIAL TRUJILLO SAC")).toBeInTheDocument();
    expect(
      screen.queryByText("SERVICIOS LOGISTICOS CHIMU SAC")
    ).not.toBeInTheDocument();
  });
});
