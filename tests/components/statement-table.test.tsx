import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  StatementTable,
  buildStatementRows,
  type StatementRow,
} from "@/components/cajas-bancos/statement-table";
import type { Payment } from "@/components/pagos/types";

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";

const payment = (overrides: Partial<Payment> = {}): Payment => ({
  id: "p-1",
  entityId: "e-1",
  direction: "INGRESO",
  paymentDate: "2026-10-05",
  receiptNumber: "RI-000001",
  amount: 100,
  methodId: "m-1",
  methodName: "Efectivo",
  cashAccountId: ACCOUNT_ID,
  cashAccountName: "Caja General",
  categoryId: "c-1",
  categoryName: "Cobranza de venta",
  reference: null,
  notes: null,
  status: "EN_REVISION",
  voidReason: null,
  voidedAt: null,
  ...overrides,
});

const row = (overrides: Partial<StatementRow> = {}): StatementRow => ({
  id: "p-1",
  kind: "PAYMENT",
  date: "2026-10-05",
  ref: "RI-000001",
  direction: "INGRESO",
  category: "Cobranza de venta",
  method: "Efectivo",
  amount: 100,
  status: "EN_REVISION",
  ...overrides,
});

function renderTable(props: {
  rows: StatementRow[];
  onMarkVerified?: (ids: string[]) => void;
  onRegisterBankCharge?: () => void;
}) {
  return render(
    <StatementTable
      rows={props.rows}
      currency="PEN"
      onMarkVerified={props.onMarkVerified}
      onRegisterBankCharge={props.onRegisterBankCharge}
    />
  );
}

describe("StatementTable", () => {
  it("muestra el estado de cada movimiento", () => {
    renderTable({
      rows: [
        row({ id: "p-1", ref: "RI-000001", status: "EN_REVISION" }),
        row({ id: "p-2", ref: "RI-000002", status: "PROCESADO" }),
        row({ id: "p-3", ref: "RI-000003", status: "ANULADO" }),
        row({ id: "t-1", ref: "Transferencia", kind: "TRANSFER", status: null }),
      ],
    });

    expect(screen.getByText("En revisión")).toBeInTheDocument();
    expect(screen.getByText("Procesado")).toBeInTheDocument();
    expect(screen.getByText("Anulado")).toBeInTheDocument();
    // Las transferencias no son recibos: no tienen estado.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("marca un recibo en revisión desde su fila", async () => {
    const user = userEvent.setup();
    const onMarkVerified = vi.fn();

    renderTable({
      rows: [row({ id: "p-1" }), row({ id: "p-2", status: "PROCESADO" })],
      onMarkVerified,
    });

    const buttons = screen.getAllByRole("button", {
      name: "Marcar verificado",
    });
    // Solo el recibo en revisión ofrece la acción.
    expect(buttons).toHaveLength(1);

    await user.click(buttons[0]);

    expect(onMarkVerified).toHaveBeenCalledWith(["p-1"]);
  });

  it("marca varios recibos con confirmación previa", async () => {
    const user = userEvent.setup();
    const onMarkVerified = vi.fn();

    renderTable({
      rows: [row({ id: "p-1" }), row({ id: "p-2", ref: "RI-000002" })],
      onMarkVerified,
    });

    await user.click(screen.getByLabelText("Seleccionar recibo RI-000001"));
    await user.click(screen.getByLabelText("Seleccionar recibo RI-000002"));

    await user.click(
      screen.getByRole("button", { name: "Marcar verificados (2)" })
    );

    // Todavía no se marca: primero se confirma.
    expect(onMarkVerified).not.toHaveBeenCalled();

    const confirmation = screen.getByText(/Marcar 2 recibo\(s\) como verificados/);
    expect(confirmation).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    expect(onMarkVerified).toHaveBeenCalledWith(["p-1", "p-2"]);
  });

  it("permite cancelar la confirmación sin marcar", async () => {
    const user = userEvent.setup();
    const onMarkVerified = vi.fn();

    renderTable({ rows: [row({ id: "p-1" })], onMarkVerified });

    await user.click(screen.getByLabelText("Seleccionar recibo RI-000001"));
    await user.click(
      screen.getByRole("button", { name: "Marcar verificados (1)" })
    );
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(onMarkVerified).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Marcar verificados (1)" })
    ).toBeInTheDocument();
  });

  it("selecciona todos los recibos en revisión desde el encabezado", async () => {
    const user = userEvent.setup();
    const onMarkVerified = vi.fn();

    renderTable({
      rows: [
        row({ id: "p-1" }),
        row({ id: "p-2", ref: "RI-000002" }),
        row({ id: "p-3", ref: "RI-000003", status: "ANULADO" }),
      ],
      onMarkVerified,
    });

    await user.click(
      screen.getByLabelText("Seleccionar todos los recibos en revisión")
    );
    await user.click(
      screen.getByRole("button", { name: "Marcar verificados (2)" })
    );
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    // El anulado no entra en la selección.
    expect(onMarkVerified).toHaveBeenCalledWith(["p-1", "p-2"]);
  });

  it("no ofrece marcar sin manejador (reporte de solo lectura)", () => {
    renderTable({ rows: [row({ id: "p-1" })] });

    expect(
      screen.queryByRole("button", { name: "Marcar verificado" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Seleccionar recibo RI-000001")
    ).not.toBeInTheDocument();
  });

  it("ofrece registrar un cargo bancario cuando se pasa el manejador", async () => {
    const user = userEvent.setup();
    const onRegisterBankCharge = vi.fn();

    renderTable({ rows: [row({ id: "p-1" })], onRegisterBankCharge });

    await user.click(
      screen.getByRole("button", { name: "Registrar cargo bancario" })
    );

    expect(onRegisterBankCharge).toHaveBeenCalledTimes(1);
  });
});

describe("buildStatementRows", () => {
  it("junta recibos y transferencias ordenados por fecha, con su estado", () => {
    const rows = buildStatementRows(
      [payment({ id: "p-1", paymentDate: "2026-10-05", status: "PROCESADO" })],
      [
        {
          id: "t-1",
          sourceAccountId: ACCOUNT_ID,
          targetAccountId: "22222222-2222-4222-8222-222222222222",
          amount: 50,
          transferDate: "2026-10-01",
          notes: null,
          createdAt: "2026-10-01T00:00:00Z",
        },
      ],
      ACCOUNT_ID
    );

    expect(rows.map((item) => item.id)).toEqual(["t-1", "p-1"]);
    expect(rows[0].status).toBeNull();
    expect(rows[1].status).toBe("PROCESADO");
    expect(rows[0].direction).toBe("EGRESO");
  });
});

describe("StatementTable con datos reales", () => {
  it("renderiza la fila construida con el estado del recibo", () => {
    const rows = buildStatementRows(
      [payment({ id: "p-9", status: "EN_REVISION" })],
      [],
      ACCOUNT_ID
    );

    renderTable({ rows });

    const table = screen.getByRole("table");
    expect(within(table).getByText("RI-000001")).toBeInTheDocument();
    expect(within(table).getByText("En revisión")).toBeInTheDocument();
  });
});
