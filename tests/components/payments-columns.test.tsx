import { useMemo } from "react";
import { describe, expect, it, vi } from "vitest";

import { useTable } from "@tanstack/react-table";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  getPaymentsColumns,
  paymentsTableFeatures,
  type PaymentsRow,
} from "@/components/pagos/payments-columns";
import type {
  PaymentListItem,
  PaymentStatus,
} from "@/components/pagos/types";

const payment = (
  overrides: Partial<PaymentListItem> = {}
): PaymentListItem => ({
  id: "p-1",
  entityId: "e-1",
  direction: "INGRESO",
  paymentDate: "2026-10-20",
  receiptNumber: "RI-000012",
  amount: 1000,
  currency: "PEN",
  methodId: "m-1",
  methodName: "Efectivo",
  cashAccountId: "acc-1",
  cashAccountName: "Caja General",
  categoryId: "cat-1",
  categoryName: "Cobranza de venta",
  reference: null,
  status: "EN_REVISION",
  voidReason: null,
  voidedAt: null,
  notes: null,
  unassignedAmount: 400,
  ...overrides,
});

const row = (overrides: Partial<PaymentsRow> = {}): PaymentsRow => ({
  ...payment(),
  entityName: "Cliente Uno",
  ...overrides,
});

function Harness({
  rows,
  onAssign = vi.fn(),
}: {
  rows: PaymentsRow[];
  onAssign?: (payment: PaymentListItem) => void;
}) {
  const columns = useMemo(
    () =>
      getPaymentsColumns({
        onView: vi.fn(),
        onPrint: vi.fn(),
        onAnnul: vi.fn(),
        onAssign,
        direction: "INGRESO",
      }),
    [onAssign]
  );
  const table = useTable({
    features: paymentsTableFeatures,
    data: rows,
    columns,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 10,
      },
    },
  });

  return (
    <table>
      <thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <th key={header.id}>
                {header.isPlaceholder ? null : (
                  <table.FlexRender header={header} />
                )}
              </th>
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((tableRow) => (
          <tr key={tableRow.id}>
            {tableRow.getAllCells().map((cell) => (
              <td key={cell.id}>
                <table.FlexRender cell={cell} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

describe("payments-columns", () => {
  it("muestra el monto por asignar y el badge Por asignar", () => {
    render(<Harness rows={[row()]} />);

    expect(screen.getByText("S/ 400.00")).toBeInTheDocument();
    expect(screen.getByText("Por asignar")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Asignar" })
    ).toBeInTheDocument();
  });

  it("muestra Asignado sin botón Asignar cuando el saldo es cero", () => {
    render(<Harness rows={[row({ unassignedAmount: 0 })]} />);

    expect(screen.getByText("Asignado")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Asignar" })
    ).not.toBeInTheDocument();
  });

  it("en un pago anulado muestra — y no ofrece asignar", () => {
    render(
      <Harness
        rows={[
          row({ status: "ANULADO" as PaymentStatus, unassignedAmount: 500 }),
        ]}
      />
    );

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("Por asignar")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Asignar" })
    ).not.toBeInTheDocument();
  });

  it("llama onAssign con la fila al pulsar Asignar", async () => {
    const onAssign = vi.fn();
    render(<Harness rows={[row()]} onAssign={onAssign} />);

    await userEvent.click(screen.getByRole("button", { name: "Asignar" }));

    expect(onAssign).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p-1", unassignedAmount: 400 })
    );
  });
});
