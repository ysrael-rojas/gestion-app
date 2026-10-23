import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import { VoucherAdjustmentsSection } from "@/components/comprobantes/voucher-adjustments-section";
import type { VoucherAdjustment } from "@/lib/comprobantes/notas";

const note = (
  overrides: Partial<VoucherAdjustment> = {}
): VoucherAdjustment => ({
  id: "a-1",
  voucherType: "NOTA_CREDITO",
  voucherNumber: "FC01-000001",
  issueDate: "2026-10-17",
  motiveCode: "01",
  total: 118,
  ...overrides,
});

const ADJUSTMENTS: VoucherAdjustment[] = [
  note(),
  note({
    id: "a-2",
    voucherType: "NOTA_DEBITO",
    voucherNumber: "FD01-000001",
    motiveCode: "02",
    total: 50,
  }),
  note({
    id: "a-3",
    voucherType: "COMPROBANTE_RETENCION",
    voucherNumber: "R001-000001",
    motiveCode: null,
    total: 30,
  }),
];

describe("VoucherAdjustmentsSection", () => {
  it("lista notas de crédito y débito con sus totales", () => {
    render(
      <VoucherAdjustmentsSection
        group="notas"
        adjustments={ADJUSTMENTS}
        voucherKind="VENTA"
      />
    );

    expect(screen.getByText("FC01-000001")).toBeInTheDocument();
    expect(screen.getByText("FD01-000001")).toBeInTheDocument();
    expect(screen.queryByText("R001-000001")).not.toBeInTheDocument();

    expect(screen.getByText("Anulación de la operación")).toBeInTheDocument();
    expect(screen.getByText("Aumento en el valor")).toBeInTheDocument();

    const creditTotal = screen.getByText("Notas de crédito").parentElement;
    expect(creditTotal).toHaveTextContent(/118\.00/);

    const debitTotal = screen.getByText("Notas de débito").parentElement;
    expect(debitTotal).toHaveTextContent(/50\.00/);
  });

  it("lista solo retenciones con el total retenido", () => {
    render(
      <VoucherAdjustmentsSection
        group="retenciones"
        adjustments={ADJUSTMENTS}
        voucherKind="VENTA"
      />
    );

    expect(screen.getByText("R001-000001")).toBeInTheDocument();
    expect(screen.queryByText("FC01-000001")).not.toBeInTheDocument();

    const total = screen.getByText("Retenido").parentElement;
    expect(total).toHaveTextContent(/30\.00/);
  });

  it("en compras explica por qué no hay retenciones", () => {
    render(
      <VoucherAdjustmentsSection
        group="retenciones"
        adjustments={[]}
        voucherKind="COMPRA"
      />
    );

    expect(
      screen.getByText(/hoy solo se reciben sobre ventas/i)
    ).toBeInTheDocument();
  });

  it("muestra el vacío de notas cuando no hay ajustes", () => {
    render(
      <VoucherAdjustmentsSection
        group="notas"
        adjustments={[]}
        voucherKind="VENTA"
      />
    );

    expect(
      screen.getByText("Este comprobante no tiene notas de crédito ni de débito aplicadas.")
    ).toBeInTheDocument();
  });

  it("muestra skeletons mientras carga", () => {
    const { container } = render(
      <VoucherAdjustmentsSection
        group="notas"
        adjustments={null}
        voucherKind="VENTA"
      />
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-slot="skeleton"]')
    ).toHaveLength(3);
  });

  it("muestra el error como alerta", () => {
    render(
      <VoucherAdjustmentsSection
        group="notas"
        adjustments={null}
        error="No se pudieron cargar los ajustes."
        voucherKind="VENTA"
      />
    );

    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("No se pudieron cargar los ajustes.")).toBeInTheDocument();
  });
});
