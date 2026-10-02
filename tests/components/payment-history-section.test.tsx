import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPaymentHistory } = await vi.hoisted(async () => {
  return { getPaymentHistory: vi.fn() };
});

vi.mock("@/lib/pagos/pagos", () => ({ getPaymentHistory }));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaymentHistorySection } from "@/components/comprobantes/payment-history-section";
import type { PaymentHistoryEntry } from "@/components/pagos/types";

const sampleEntry = (overrides: Partial<PaymentHistoryEntry> = {}): PaymentHistoryEntry => ({
  allocationId: "a-1",
  paymentId: "p-1",
  receiptNumber: "RI-2026-000001",
  paymentDate: "2026-09-30",
  issueDate: "2026-09-30",
  direction: "INGRESO",
  method: "EFECTIVO",
  reference: null,
  paymentAmount: 100,
  amount: 50,
  status: "REGISTRADO",
  voidedAt: null,
  voidReason: null,
  notes: null,
  ...overrides,
});

describe("PaymentHistorySection", () => {
  beforeEach(() => {
    vi.mocked(getPaymentHistory).mockReset();
  });

  it("muestra estado de carga con skeletons inicialmente", () => {
    vi.mocked(getPaymentHistory).mockReturnValue(new Promise(() => {}));

    render(
      <PaymentHistorySection
        comprobanteId="c-1"
        direction="INGRESO"
        onPrint={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("row")).toHaveLength(1 + 3); // header + 3 skeleton rows
  });

  it("muestra estado vacío cuando getPaymentHistory devuelve []", async () => {
    vi.mocked(getPaymentHistory).mockResolvedValue([]);

    render(
      <PaymentHistorySection
        comprobanteId="c-1"
        direction="INGRESO"
        onPrint={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText("Aún no se han registrado pagos para este comprobante."),
      ).toBeInTheDocument();
    });
  });

  it("renderiza una fila por entrada con el botón Imprimir recibo", async () => {
    vi.mocked(getPaymentHistory).mockResolvedValue([
      sampleEntry(),
      sampleEntry({
        allocationId: "a-2",
        paymentId: "p-2",
        receiptNumber: "RI-2026-000002",
        amount: 30,
      }),
    ]);
    const onPrint = vi.fn();

    render(
      <PaymentHistorySection
        comprobanteId="c-1"
        direction="INGRESO"
        onPrint={onPrint}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("RI-2026-000001")).toBeInTheDocument();
      expect(screen.getByText("RI-2026-000002")).toBeInTheDocument();
    });

    const printButtons = screen.getAllByRole("button", { name: /imprimir recibo/i });
    expect(printButtons).toHaveLength(2);

    await userEvent.click(printButtons[0]!);
    expect(onPrint).toHaveBeenCalledWith("p-1");
  });

  it("muestra mensaje de error y emite toast.error cuando la consulta falla", async () => {
    const toast = (await import("sonner")).toast;
    vi.mocked(getPaymentHistory).mockRejectedValue(new Error("boom"));

    render(
      <PaymentHistorySection
        comprobanteId="c-1"
        direction="INGRESO"
        onPrint={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("boom");
      expect(toast.error).toHaveBeenCalledWith("boom");
    });
  });
});
