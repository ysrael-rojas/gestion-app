import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaymentHistorySection } from "@/components/comprobantes/payment-history-section";
import type { PaymentHistoryEntry } from "@/components/pagos/types";

const sampleEntry = (
  overrides: Partial<PaymentHistoryEntry> = {}
): PaymentHistoryEntry => ({
  allocationId: "a-1",
  paymentId: "p-1",
  receiptNumber: "RI-000001",
  paymentDate: "2026-09-30",
  direction: "INGRESO",
  methodName: "Efectivo",
  cashAccountName: "Caja principal",
  categoryName: "Cobranza de venta",
  reference: null,
  paymentAmount: 100,
  amount: 50,
  status: "EN_REVISION",
  voidedAt: null,
  voidReason: null,
  notes: null,
  ...overrides,
});

describe("PaymentHistorySection", () => {
  it("muestra skeletons mientras entries es null", () => {
    render(<PaymentHistorySection entries={null} onPrint={vi.fn()} />);

    expect(screen.getAllByRole("row")).toHaveLength(1 + 3); // header + 3 skeletons
  });

  it("muestra el estado vacío cuando no hay pagos", () => {
    render(<PaymentHistorySection entries={[]} onPrint={vi.fn()} />);

    expect(
      screen.getByText("Aún no se han registrado pagos para este comprobante.")
    ).toBeInTheDocument();
  });

  it("renderiza una fila por entrada, incluidas las anuladas", () => {
    render(
      <PaymentHistorySection
        entries={[
          sampleEntry(),
          sampleEntry({
            allocationId: "a-2",
            paymentId: "p-2",
            receiptNumber: "RI-000002",
            amount: 30,
            status: "ANULADO",
            voidedAt: "2026-10-23T06:10:00Z",
            voidReason: "Prueba",
          }),
        ]}
        onPrint={vi.fn()}
      />
    );

    expect(screen.getByText("RI-000001")).toBeInTheDocument();
    expect(screen.getByText("RI-000002")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2
  });

  it("el botón Imprimir recibo entrega el id del pago", async () => {
    const onPrint = vi.fn();
    render(<PaymentHistorySection entries={[sampleEntry()]} onPrint={onPrint} />);

    const [printButton] = screen.getAllByRole("button", {
      name: /imprimir recibo/i,
    });
    await userEvent.click(printButton!);

    expect(onPrint).toHaveBeenCalledWith("p-1");
  });

  it("muestra el error como alerta", () => {
    render(
      <PaymentHistorySection
        entries={[]}
        error="No se pudo cargar el historial de pagos."
        onPrint={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se pudo cargar el historial de pagos."
    );
  });
});
