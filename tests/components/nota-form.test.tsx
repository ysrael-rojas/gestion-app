import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { NOTA_FORM_ID, NotaForm } from "@/components/notas/nota-form";
import type { Nota, ReferableComprobante } from "@/components/notas/types";
import type { AdjustmentVoucherType } from "@/lib/data/nota-options";
import { formatCurrency } from "@/lib/utils";

const ENTITY_NAMES: Record<string, string> = {
  "e-cliente": "Distribuidora Norte SAC",
  "e-proveedor": "Ferretería El Sol EIRL",
};

const resolveEntityName = (entityId: string) =>
  ENTITY_NAMES[entityId] ?? "Entidad no encontrada";

/** `formatCurrency` usa NBSP tras "S/"; el matcher de texto normaliza al espacio común. */
const money = (value: number) => formatCurrency(value).replace(/\u00a0/g, " ");

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
    balance: 200,
    creditAmount: 36,
    status: "PENDIENTE",
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

const VENTA_OPTION = "F001-000001 — Distribuidora Norte SAC";
const VENTA_CON_CREDITOS_OPTION = "B001-000002 — Distribuidora Norte SAC";
const COMPRA_OPTION = "F001-000099 — Ferretería El Sol EIRL";

function baseNota(overrides: Partial<Nota> = {}): Nota {
  return {
    id: "n-1",
    issueDate: "2026-10-10",
    registrationDate: "2026-10-10",
    voucherType: "NOTA_CREDITO",
    voucherNumber: "FC01-000001",
    motiveCode: "01",
    entityId: "e-cliente",
    total: 36,
    voucherKind: "VENTA",
    referencedId: "v-2",
    referencedNumber: "B001-000002",
    referencedType: "BOLETA",
    ...overrides,
  };
}

function renderForm(
  {
    voucherType = "NOTA_CREDITO",
    nota = null,
  }: {
    voucherType?: AdjustmentVoucherType;
    nota?: Nota | null;
  } = {}
) {
  const onSubmit = vi.fn();

  render(
    <>
      <NotaForm
        voucherType={voucherType}
        nota={nota}
        referables={REFERABLES}
        resolveEntityName={resolveEntityName}
        onSubmit={onSubmit}
      />
      <button type="submit" form={NOTA_FORM_ID}>
        Guardar
      </button>
    </>
  );

  return onSubmit;
}

async function pickReferable(optionName: string) {
  const user = userEvent.setup();

  await user.click(screen.getByLabelText("Comprobante referenciado"));
  await user.click(await screen.findByRole("option", { name: optionName }));

  return user;
}

describe("NotaForm — resumen del comprobante referenciado", () => {
  it("precarga total, créditos aplicados y tope disponible al elegir el comprobante", async () => {
    renderForm();

    await pickReferable(VENTA_CON_CREDITOS_OPTION);

    expect(
      screen.getByText(`Total del comprobante: ${money(236)}`)
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Créditos y retenciones aplicados: ${money(36)}`)
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Tope disponible para este documento: ${money(200)}`)
    ).toBeInTheDocument();
  });

  it("al cambiar la relación limpia la referencia y ofrece compras", async () => {
    renderForm();

    const user = await pickReferable(VENTA_OPTION);

    expect(screen.getByText(/Total del comprobante/)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Relación"));
    await user.click(await screen.findByRole("option", { name: "Recibida" }));

    expect(
      screen.queryByText(/Total del comprobante/)
    ).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Comprobante referenciado"));

    expect(
      await screen.findByRole("option", { name: COMPRA_OPTION })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: VENTA_OPTION })
    ).not.toBeInTheDocument();
  });
});

describe("NotaForm — montos", () => {
  it("calcula subtotal e IGV a partir del total", async () => {
    renderForm();

    const user = userEvent.setup();

    await user.type(screen.getByLabelText("Total"), "118");

    expect(screen.getByLabelText("Subtotal (solo lectura)")).toHaveValue(
      formatCurrency(100)
    );
    expect(screen.getByLabelText("IGV 18 % (solo lectura)")).toHaveValue(
      formatCurrency(18)
    );
  });
});

describe("NotaForm — validaciones en español", () => {
  it("rechaza guardar sin referencia, motivo, número ni total", async () => {
    const onSubmit = renderForm();

    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      await screen.findByText("Selecciona el comprobante referenciado")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Selecciona el motivo de la nota")
    ).toBeInTheDocument();
    expect(
      screen.getByText("El número de comprobante es requerido")
    ).toBeInTheDocument();
    expect(
      screen.getByText("El total debe ser mayor a 0")
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rechaza un número fuera del formato serie-correlativo", async () => {
    const onSubmit = renderForm();

    const user = userEvent.setup();
    await pickReferable(VENTA_OPTION);
    await user.type(screen.getByLabelText("Nro comprobante"), "000001");
    await user.type(screen.getByLabelText("Total"), "10");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(
      await screen.findByText(
        "Usa el formato serie-correlativo, por ejemplo F001-000001"
      )
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("NotaForm — comprobante de retención", () => {
  it("registra sin motivo y sin desglose de IGV, solo referencias de compra", async () => {
    const onSubmit = renderForm({ voucherType: "COMPROBANTE_RETENCION" });

    expect(screen.getByLabelText("Monto retenido")).toBeInTheDocument();
    expect(screen.queryByLabelText("Motivo")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Subtotal (solo lectura)")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("IGV 18 % (solo lectura)")
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Relación")).not.toBeInTheDocument();

    const user = await pickReferable(COMPRA_OPTION);

    await user.type(screen.getByLabelText("Nro comprobante"), "R001-000001");
    await user.type(screen.getByLabelText("Monto retenido"), "5.9");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        voucherType: "COMPROBANTE_RETENCION",
        voucherNumber: "R001-000001",
        total: 5.9,
        referencedComprobanteId: "c-1",
      })
    );
  });

  it("solo ofrece comprobantes de compra como referenciables", async () => {
    renderForm({ voucherType: "COMPROBANTE_RETENCION" });

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Comprobante referenciado"));

    expect(
      await screen.findByRole("option", { name: COMPRA_OPTION })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: VENTA_OPTION })
    ).not.toBeInTheDocument();
  });
});

describe("NotaForm — edición", () => {
  it("precarga los datos de la nota y avisa que la referencia no cambia", async () => {
    renderForm({ nota: baseNota() });

    expect(screen.getByLabelText("Fecha de emisión")).toHaveValue("2026-10-10");
    expect(screen.getByLabelText("Nro comprobante")).toHaveValue("FC01-000001");
    expect(screen.getByLabelText("Total")).toHaveValue(36);
    expect(screen.getByText("Anulación de la operación")).toBeInTheDocument();
    expect(
      screen.getByText("La referencia y el tipo de una nota no se pueden cambiar.")
    ).toBeInTheDocument();
    expect(screen.getByText(/Tope disponible para este documento/)).toBeInTheDocument();
  });

  it("excluye la propia nota del tope disponible al editar", async () => {
    const ownTotal = 36;

    renderForm({ nota: baseNota({ total: ownTotal }) });

    // La boleta tiene 36 de créditos y son de esta misma nota: el tope
    // disponible vuelve a ser su total (236).
    expect(
      screen.getByText(`Créditos y retenciones aplicados: ${money(0)}`)
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Tope disponible para este documento: ${money(236)}`)
    ).toBeInTheDocument();
  });

  it("muestra el aviso de aumento de saldo sin tope en una nota de débito", async () => {
    renderForm({
      voucherType: "NOTA_DEBITO",
      nota: baseNota({ voucherType: "NOTA_DEBITO", motiveCode: "02" }),
    });

    expect(
      screen.getByText("Una nota de débito aumenta el saldo del comprobante.")
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Tope disponible para este documento/)
    ).not.toBeInTheDocument();
  });
});
