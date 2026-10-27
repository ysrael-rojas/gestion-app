import { beforeEach, describe, expect, it, vi } from "vitest";

const { assignAllocations, listOpenVouchers, toastSuccess } = vi.hoisted(
  () => ({
    assignAllocations: vi.fn(),
    listOpenVouchers: vi.fn(),
    toastSuccess: vi.fn(),
  })
);

vi.mock("@/components/pagos/pagos-provider", () => ({
  usePagos: () => ({ assignAllocations }),
}));
vi.mock("@/components/clientes/clientes-provider", () => ({
  useClientes: () => ({ clients: [], isLoading: false }),
}));
vi.mock("@/components/pagos/use-entity-name", () => ({
  useEntityOptions: () => [],
}));
vi.mock("@/lib/pagos/pagos", () => ({ listOpenVouchers }));
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: vi.fn() },
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaymentAssignDialog } from "@/components/pagos/payment-assign-dialog";
import type {
  PaymentListItem,
  VoucherBalance,
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
  isCashMovement: false,
  unassignedAmount: 400,
  ...overrides,
});

const voucher = (overrides: Partial<VoucherBalance> = {}): VoucherBalance => ({
  comprobanteId: "c-1",
  entityId: "e-1",
  voucherKind: "VENTA",
  voucherType: "FACTURA",
  voucherNumber: "F001-000009",
  issueDate: "2026-10-01",
  effectiveDueDate: null,
  paymentType: "CONTADO",
  total: 300,
  paidAmount: 0,
  balance: 300,
  ...overrides,
});

function renderDialog(
  overrides: Partial<PaymentListItem> = {},
  props: Partial<React.ComponentProps<typeof PaymentAssignDialog>> = {}
) {
  const onOpenChange = vi.fn();
  const onAssigned = vi.fn();

  render(
    <PaymentAssignDialog
      payment={payment(overrides)}
      open
      onOpenChange={onOpenChange}
      onAssigned={onAssigned}
      {...props}
    />
  );

  return { onOpenChange, onAssigned };
}

describe("PaymentAssignDialog", () => {
  beforeEach(() => {
    assignAllocations.mockReset();
    assignAllocations.mockResolvedValue(undefined);
    listOpenVouchers.mockReset();
    listOpenVouchers.mockResolvedValue([voucher()]);
    toastSuccess.mockReset();
  });

  it("muestra la banda del pago y no pide entidad si el pago ya la tiene", () => {
    renderDialog();

    expect(screen.getByText("Asignar saldo del pago")).toBeInTheDocument();
    expect(screen.getByText("Recibo RI-000012")).toBeInTheDocument();
    expect(screen.getByText("Importe")).toBeInTheDocument();
    expect(screen.getByText("Asignado")).toBeInTheDocument();
    expect(screen.getByText("Por asignar")).toBeInTheDocument();
    expect(screen.getByText("S/ 1,000.00")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cliente")).not.toBeInTheDocument();
  });

  it("pide Cliente/Proveedor cuando el pago no tiene entidad (anticipo)", async () => {
    renderDialog({ entityId: null });

    expect(screen.getByLabelText("Cliente")).toBeInTheDocument();
    expect(
      screen.getByText(/Debes ingresar el cliente\/proveedor/i)
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(listOpenVouchers).not.toHaveBeenCalled();
    });
  });

  it("asigna el saldo al comprobante marcado y cierra el diálogo", async () => {
    const { onOpenChange, onAssigned } = renderDialog();

    await userEvent.click(await screen.findByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Asignar" }));

    await waitFor(() => {
      expect(assignAllocations).toHaveBeenCalledWith(
        "p-1",
        [{ comprobanteId: "c-1", amount: 300 }],
        "e-1"
      );
    });
    expect(toastSuccess).toHaveBeenCalledWith("Saldo asignado");
    expect(onAssigned).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("no permite confirmar sin comprobantes seleccionados", async () => {
    renderDialog();

    expect(screen.getByRole("button", { name: "Asignar" })).toBeDisabled();
    await waitFor(() => {
      expect(listOpenVouchers).toHaveBeenCalledWith("INGRESO", "e-1");
    });
  });

  it("muestra el error del provider cuando la asignación falla", async () => {
    assignAllocations.mockRejectedValue(new Error("Saldo insuficiente"));
    renderDialog();

    await userEvent.click(await screen.findByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Asignar" }));

    await waitFor(() => {
      expect(assignAllocations).toHaveBeenCalled();
    });
  });
});
