import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReferablePickerModal } from "@/components/notas/referable-picker-modal";
import type { ReferableComprobante } from "@/components/notas/types";
import type { AdjustmentVoucherType } from "@/lib/data/nota-options";
import { formatCurrency } from "@/lib/utils";

const ENTITY_NAMES: Record<string, string> = {
  "e-cliente": "Distribuidora Norte SAC",
  "e-proveedor": "Ferretería El Sol EIRL",
};

const resolveEntityName = (entityId: string) =>
  ENTITY_NAMES[entityId] ?? "Entidad no encontrada";

/** `formatCurrency` usa NBSP tras "S/"; el matcher de texto normaliza al espacio común. */
const money = (value: number) =>
  formatCurrency(value).replace(/\u00a0/g, " ");

const REFERABLES: ReferableComprobante[] = [
  {
    id: "v-1",
    entityId: "e-cliente",
    voucherKind: "VENTA",
    voucherType: "FACTURA",
    voucherNumber: "F001-000001",
    issueDate: "2026-10-01",
    total: 118,
    paidAmount: 0,
    balance: 118,
    creditAmount: 0,
    status: "PENDIENTE",
  },
  {
    id: "v-2",
    entityId: "e-cliente",
    voucherKind: "VENTA",
    voucherType: "BOLETA",
    voucherNumber: "B001-000002",
    issueDate: "2026-10-02",
    total: 236,
    paidAmount: 0,
    balance: 0,
    creditAmount: 236,
    status: "PAGADO",
  },
  {
    id: "c-1",
    entityId: "e-proveedor",
    voucherKind: "COMPRA",
    voucherType: "FACTURA",
    voucherNumber: "F001-000099",
    issueDate: "2026-10-03",
    total: 59,
    paidAmount: 0,
    balance: 59,
    creditAmount: 0,
    status: "PENDIENTE",
  },
];

function renderPicker(
  {
    voucherType = "NOTA_CREDITO",
    referables = REFERABLES,
  }: {
    voucherType?: AdjustmentVoucherType;
    referables?: ReferableComprobante[];
  } = {}
) {
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();

  render(
    <ReferablePickerModal
      open
      onOpenChange={onOpenChange}
      voucherType={voucherType}
      referables={referables}
      resolveEntityName={resolveEntityName}
      onSelect={onSelect}
    />
  );

  return { onSelect, onOpenChange };
}

describe("ReferablePickerModal — pestañas y columnas", () => {
  it("alterna entre emitidas y recibidas", async () => {
    renderPicker();

    const user = userEvent.setup();

    expect(screen.getByRole("tab", { name: "Emitidas" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Recibidas" })).toBeInTheDocument();
    expect(screen.getByText("F001-000001")).toBeInTheDocument();
    expect(screen.queryByText("F001-000099")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Recibidas" }));

    expect(await screen.findByText("F001-000099")).toBeInTheDocument();
    expect(screen.queryByText("F001-000001")).not.toBeInTheDocument();
  });

  it("en retención no muestra pestañas y solo lista compras", () => {
    renderPicker({ voucherType: "COMPROBANTE_RETENCION" });

    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByText("F001-000099")).toBeInTheDocument();
    expect(screen.getAllByText(money(59))).toHaveLength(2);
    expect(screen.queryByText("F001-000001")).not.toBeInTheDocument();
  });

  it("lista las columnas de datos del comprobante", () => {
    renderPicker();

    expect(screen.getByText("F. emisión")).toBeInTheDocument();
    expect(screen.getByText("Nro")).toBeInTheDocument();
    expect(screen.getByText("Cliente / Proveedor")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Tope disponible")).toBeInTheDocument();
    expect(screen.getAllByText("Distribuidora Norte SAC")).toHaveLength(2);
  });
});

describe("ReferablePickerModal — elegibilidad", () => {
  it("deshabilita la fila sin tope disponible en una nota de crédito", () => {
    renderPicker();

    const topadaRow = screen.getByText("B001-000002").closest("tr");
    expect(topadaRow).not.toBeNull();
    expect(
      within(topadaRow as HTMLElement).getByRole("button", { name: "Elegir" })
    ).toBeDisabled();
    expect(
      within(topadaRow as HTMLElement).getByText(money(0))
    ).toBeInTheDocument();

    const disponibleRow = screen.getByText("F001-000001").closest("tr");
    expect(disponibleRow).not.toBeNull();
    expect(
      within(disponibleRow as HTMLElement).getByRole("button", {
        name: "Elegir",
      })
    ).toBeEnabled();
  });

  it("en una nota de débito todas las filas son elegibles y el tope muestra —", () => {
    renderPicker({ voucherType: "NOTA_DEBITO" });

    for (const button of screen.getAllByRole("button", { name: "Elegir" })) {
      expect(button).toBeEnabled();
    }

    expect(screen.getAllByText("—")).toHaveLength(2);
  });
});

describe("ReferablePickerModal — selección", () => {
  it("llama a onSelect con el comprobante elegido", async () => {
    const { onSelect } = renderPicker();

    const user = userEvent.setup();
    const row = screen.getByText("F001-000001").closest("tr");

    await user.click(
      within(row as HTMLElement).getByRole("button", { name: "Elegir" })
    );

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toEqual(
      expect.objectContaining({ id: "v-1", voucherNumber: "F001-000001" })
    );
  });
});

describe("ReferablePickerModal — búsqueda y paginación", () => {
  it("filtra las filas por búsqueda", async () => {
    renderPicker();

    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText("Buscar comprobante..."),
      "B001"
    );

    expect(screen.getByText("B001-000002")).toBeInTheDocument();
    expect(screen.queryByText("F001-000001")).not.toBeInTheDocument();
  });

  it("muestra el paginador", () => {
    renderPicker();

    expect(screen.getByText(/Mostrando/)).toBeInTheDocument();
    expect(screen.getByLabelText("Filas por página")).toBeInTheDocument();
  });
});
