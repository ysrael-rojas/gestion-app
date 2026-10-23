import { beforeEach, describe, expect, it, vi } from "vitest";

const { listOpenVouchers, addPayment, replace } = vi.hoisted(() => ({
  listOpenVouchers: vi.fn(),
  addPayment: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("@/lib/pagos/pagos", () => ({ listOpenVouchers }));
vi.mock("@/components/pagos/pagos-provider", () => ({
  usePagos: () => ({ addPayment }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/clientes/entidades", () => ({
  listClients: vi.fn(async () => []),
  listSuppliers: vi.fn(async () => []),
  createClientRecord: vi.fn(),
  updateClientRecord: vi.fn(),
  softDeleteClient: vi.fn(),
}));
vi.mock("@/lib/cuentas/entidades", () => ({
  listCashAccounts: vi.fn(async () => []),
  createCashAccount: vi.fn(),
  updateCashAccount: vi.fn(),
  softDeleteCashAccount: vi.fn(),
}));
vi.mock("@/lib/caja/caja", () => ({
  ensureDefaultSettings: vi.fn(async () => undefined),
  ensureCatalogsSeeded: vi.fn(async () => undefined),
  listPaymentMethods: vi.fn(async () => []),
  listCategories: vi.fn(async () => []),
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CajasBancosProvider } from "@/components/cajas-bancos/cajas-bancos-provider";
import { ClientesProvider } from "@/components/clientes/clientes-provider";
import { PaymentsCreateView } from "@/components/pagos/payments-create-view";
import type { VoucherBalance } from "@/components/pagos/types";

const ENTITY_ID = "11111111-1111-4111-8111-111111111111";

const voucher = (
  overrides: Partial<VoucherBalance> = {}
): VoucherBalance => ({
  comprobanteId: "v-1",
  entityId: ENTITY_ID,
  voucherKind: "VENTA",
  voucherType: "FACTURA",
  voucherNumber: "F001-000001",
  issueDate: "2026-10-01",
  effectiveDueDate: "2026-10-15",
  paymentType: "CREDITO",
  total: 120,
  paidAmount: 0,
  balance: 120,
  ...overrides,
});

const VOUCHERS = [
  voucher(),
  voucher({
    comprobanteId: "v-2",
    voucherNumber: "F001-000002",
    effectiveDueDate: "2026-10-20",
    total: 80,
    balance: 80,
  }),
];

function renderView(props: {
  initialEntityId?: string;
  initialComprobanteId?: string;
}) {
  return render(
    <ClientesProvider>
      <CajasBancosProvider>
        <PaymentsCreateView direction="INGRESO" {...props} />
      </CajasBancosProvider>
    </ClientesProvider>
  );
}

function summaryValue(label: string): string | null {
  return screen.getByText(label).nextElementSibling?.textContent ?? null;
}

describe("PaymentsCreateView", () => {
  beforeEach(() => {
    listOpenVouchers.mockReset();
    addPayment.mockReset();
    replace.mockReset();
    listOpenVouchers.mockResolvedValue(VOUCHERS);
  });

  it("muestra importe, asignado y sin asignar, y se recalcula al escribir", async () => {
    renderView({});

    const amountInput = screen.getByLabelText("Importe");
    await userEvent.type(amountInput, "100");

    expect(summaryValue("Importe del pago")).toContain("100.00");
    expect(summaryValue("Asignado")).toContain("0.00");
    expect(summaryValue("Sin asignar")).toContain("100.00");
  });

  it("precarga el comprobante pedido con su saldo y sugiere el importe", async () => {
    renderView({
      initialEntityId: ENTITY_ID,
      initialComprobanteId: "v-2",
    });

    await waitFor(() => {
      expect(listOpenVouchers).toHaveBeenCalledWith("INGRESO", ENTITY_ID);
    });

    await waitFor(() => {
      expect(summaryValue("Importe del pago")).toContain("80.00");
      expect(summaryValue("Asignado")).toContain("80.00");
      expect(summaryValue("Sin asignar")).toContain("0.00");
    });

    expect(screen.getByLabelText("Importe a asignar a F001-000002")).toHaveValue(
      80
    );
    expect(screen.getByText("Saldo actual").nextElementSibling).toHaveTextContent(
      "80.00"
    );
    expect(screen.getByText("Nuevo saldo").nextElementSibling).toHaveTextContent(
      "0.00"
    );
  });

  it("auto-distribuye el importe entre los comprobantes más antiguos", async () => {
    renderView({ initialEntityId: ENTITY_ID });

    await waitFor(() => {
      expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    });

    await userEvent.type(screen.getByLabelText("Importe"), "150");
    await userEvent.click(
      screen.getByRole("button", { name: /auto-distribuir/i })
    );

    expect(screen.getByLabelText("Importe a asignar a F001-000001")).toHaveValue(
      120
    );
    expect(screen.getByLabelText("Importe a asignar a F001-000002")).toHaveValue(
      30
    );
    expect(summaryValue("Asignado")).toContain("150.00");
    expect(summaryValue("Sin asignar")).toContain("0.00");
  });

  it("avisa cuando el reparto supera el importe del pago (SPEC 37)", async () => {
    renderView({ initialEntityId: ENTITY_ID });

    await waitFor(() => {
      expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    });

    await userEvent.type(screen.getByLabelText("Importe"), "100");
    await userEvent.click(screen.getAllByRole("checkbox")[0]!);

    const rowAmount = screen.getByLabelText("Importe a asignar a F001-000001");
    await userEvent.clear(rowAmount);
    await userEvent.type(rowAmount, "99999");

    expect(
      screen.getByText(/El reparto supera el importe del pago/)
    ).toBeInTheDocument();
  });

  it("ofrece Cancelar hacia el listado y Registrar como submit del formulario", () => {
    renderView({});

    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute(
      "href",
      "/pagos/ingresos"
    );

    const submit = screen.getByRole("button", { name: "Registrar" });
    expect(submit).toHaveAttribute("type", "submit");
    expect(submit).toHaveAttribute("form", "payment-form");
  });
});
