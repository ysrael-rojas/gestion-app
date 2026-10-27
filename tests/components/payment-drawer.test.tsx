import { beforeEach, describe, expect, it, vi } from "vitest";

const { addPayment, toastSuccess, ACCOUNTS, METHODS, CATEGORIES } =
  vi.hoisted(() => ({
    addPayment: vi.fn(),
    toastSuccess: vi.fn(),
    ACCOUNTS: [
      {
        id: "acc-caja",
        type: "CASH_BOX" as const,
        name: "Caja General",
        currency: "PEN",
        bankName: null,
        accountNumber: null,
        cci: null,
        closingPeriodicity: null,
        openingBalance: 0,
        openingBalanceDate: "2026-10-01",
        notes: null,
        isActive: true,
        isPettyCash: false,
        changeFund: 0,
        pettyExpenseLimit: null,
        custodianName: null,
      },
      {
        id: "acc-banco",
        type: "BANK_ACCOUNT" as const,
        name: "Banco USD",
        currency: "USD",
        bankName: "BCP",
        accountNumber: "123",
        cci: null,
        closingPeriodicity: null,
        openingBalance: 0,
        openingBalanceDate: "2026-10-01",
        notes: null,
        isActive: true,
        isPettyCash: false,
        changeFund: 0,
        pettyExpenseLimit: null,
        custodianName: null,
      },
    ],
    METHODS: [
      { id: "m-efectivo", code: "EFECTIVO", name: "Efectivo", isActive: true },
      {
        id: "m-transferencia",
        code: "TRANSFERENCIA_BCP",
        name: "Transferencia BCP",
        isActive: true,
      },
    ],
    CATEGORIES: [
      {
        id: "cat-cobranza",
        direction: "INGRESO" as const,
        name: "Cobranza de venta",
        code: "COBRANZA_VENTA",
        isActive: true,
      },
      {
        id: "cat-pago",
        direction: "EGRESO" as const,
        name: "Pago a proveedor",
        code: "PAGO_PROVEEDOR",
        isActive: true,
      },
    ],
  }));

vi.mock("@/components/pagos/pagos-provider", () => ({
  usePagos: () => ({ addPayment }),
}));
vi.mock("@/components/cajas-bancos/cajas-bancos-provider", () => ({
  useCajasBancos: () => ({ accounts: ACCOUNTS }),
}));
vi.mock("@/lib/caja/caja", () => ({
  ensureDefaultSettings: vi.fn(async () => undefined),
  ensureCatalogsSeeded: vi.fn(async () => undefined),
  listPaymentMethods: vi.fn(async () => METHODS),
  listCategories: vi.fn(async (direction: string) =>
    CATEGORIES.filter((category) => category.direction === direction)
  ),
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: vi.fn() },
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaymentDrawer } from "@/components/comprobantes/payment-drawer";
import type { PaymentDirection } from "@/components/pagos/types";
import type { PaymentType } from "@/components/ventas/types";

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  direction: "INGRESO" as PaymentDirection,
  entityName: "Distribuidora Norte SAC",
  voucherType: "FACTURA" as const,
  voucherNumber: "F001-000012",
  issueDate: "2026-10-01",
  condition: "CREDITO" as PaymentType,
  dueDate: "2026-10-31" as string | null,
  entityId: "e-1",
  comprobanteId: "c-1",
  total: 118,
  paidAmount: 18,
  balance: 100,
  onRegistered: vi.fn(),
};

function renderDrawer(overrides: Partial<typeof baseProps> = {}) {
  return render(<PaymentDrawer {...baseProps} {...overrides} />);
}

async function pickMethod(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByLabelText("Método"));
  await user.click(await screen.findByRole("option", { name }));
}

async function pickAccount(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  optionName: string
) {
  await user.click(screen.getByLabelText(label));
  await user.click(await screen.findByRole("option", { name: optionName }));
}

describe("PaymentDrawer", () => {
  beforeEach(() => {
    addPayment.mockReset();
    addPayment.mockResolvedValue(undefined);
    toastSuccess.mockReset();
    baseProps.onOpenChange.mockReset();
    baseProps.onRegistered.mockReset();
  });

  it("muestra comprobante, montos y campos en un solo drawer sin pasos", async () => {
    renderDrawer();

    expect(
      screen.getByRole("heading", { name: "Registrar pago" })
    ).toBeInTheDocument();
    expect(screen.getByText("F001-000012")).toBeInTheDocument();
    expect(screen.getByText("Distribuidora Norte SAC")).toBeInTheDocument();

    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Monto abonado")).toBeInTheDocument();
    expect(screen.getByText("Saldo por pagar")).toBeInTheDocument();

    expect(screen.getByLabelText("Fecha de pago")).toBeInTheDocument();
    expect(screen.getByLabelText("Importe")).toHaveValue(100);
    expect(screen.getByLabelText("Método")).toBeInTheDocument();
    expect(screen.getByLabelText("Caja/Banco")).toBeInTheDocument();
    expect(screen.getByLabelText("Categoría")).toBeDisabled();
    expect(screen.getByLabelText("Referencia (opcional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Notas (opcional)")).toBeInTheDocument();

    expect(
      screen.queryByRole("button", { name: "Continuar" })
    ).not.toBeInTheDocument();
  });

  it("marca con 'Requerido' los campos obligatorios", () => {
    renderDrawer();

    expect(screen.getAllByText("Requerido")).toHaveLength(4);
  });

  it("muestra el header uniforme con tipo, cliente y datos de emisión", () => {
    renderDrawer();

    const identity = screen.getByTestId("payment-drawer-identity");
    expect(identity).toHaveClass("text-sm");
    expect(identity.querySelector('[class*="text-xs"]')).toBeNull();
    expect(identity.querySelector('[class*="text-base"]')).toBeNull();
    expect(identity.querySelector('[class*="text-lg"]')).toBeNull();

    expect(screen.getByText("Factura:")).toHaveClass("uppercase");
    expect(screen.getByText("Cliente:")).toHaveClass("uppercase");
    expect(screen.getByText("Fecha emisión:")).toHaveClass("uppercase");
    expect(screen.getByText("Condición:")).toHaveClass("uppercase");
    expect(screen.getByText("Vencimiento:")).toHaveClass("uppercase");
    expect(screen.getByText("31/10/2026")).toBeInTheDocument();
  });

  it("no muestra vencimiento cuando la condición es contado", () => {
    renderDrawer({ condition: "CONTADO", dueDate: null });

    expect(screen.queryByText("Vencimiento:")).not.toBeInTheDocument();
    expect(screen.getByText("Contado")).toBeInTheDocument();
  });

  it(
    "mantiene Seleccionar en Método y limpia la cuenta incompatible",
    { timeout: 15_000 },
    async () => {
      const user = userEvent.setup();
      renderDrawer();

      await pickMethod(user, "Transferencia BCP");
      await pickAccount(user, "Banco", "Banco USD · USD");
      expect(screen.getByLabelText("Banco")).toHaveTextContent("Banco USD");

      await user.click(screen.getByLabelText("Método"));
      await user.click(
        await screen.findByRole("option", { name: "Seleccionar" })
      );

      expect(screen.getByLabelText("Método")).toHaveTextContent("Seleccionar");
      expect(screen.getByLabelText("Caja/Banco")).toHaveTextContent(
        "Seleccionar"
      );
    }
  );

  it("permite volver a Seleccionar en Caja/Banco", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await pickMethod(user, "Efectivo");
    await pickAccount(user, "Caja/Banco", "Caja General · PEN");

    await user.click(screen.getByLabelText("Caja/Banco"));
    await user.click(
      await screen.findByRole("option", { name: "Seleccionar" })
    );

    expect(screen.getByLabelText("Caja/Banco")).toHaveTextContent(
      "Seleccionar"
    );
  });

  it("valida al enviar y lleva el foco al primer error", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole("button", { name: "Registrar pago" }));

    expect(
      await screen.findByText("Selecciona un método de pago.")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Selecciona una caja o banco.")
    ).toBeInTheDocument();
    expect(addPayment).not.toHaveBeenCalled();

    const firstAlert = screen.getAllByRole("alert")[0]!;
    await waitFor(() => {
      expect(document.activeElement).toBe(firstAlert);
    });
  });

  it("rechaza un importe mayor al saldo", async () => {
    const user = userEvent.setup();
    renderDrawer();

    const amount = screen.getByLabelText("Importe");
    await user.clear(amount);
    await user.type(amount, "150");
    await pickMethod(user, "Efectivo");
    await pickAccount(user, "Caja/Banco", "Caja General · PEN");
    await user.click(screen.getByRole("button", { name: "Registrar pago" }));

    expect(
      await screen.findByText("El importe supera el saldo del comprobante.")
    ).toBeInTheDocument();
    expect(addPayment).not.toHaveBeenCalled();
  });

  it("registra el pago con la asignación al comprobante", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await pickMethod(user, "Efectivo");
    await pickAccount(user, "Caja/Banco", "Caja General · PEN");
    await user.click(screen.getByRole("button", { name: "Registrar pago" }));

    await waitFor(() => {
      expect(addPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: "e-1",
          direction: "INGRESO",
          amount: 100,
          methodId: "m-efectivo",
          cashAccountId: "acc-caja",
          categoryId: "cat-cobranza",
          allocations: [{ comprobanteId: "c-1", amount: 100 }],
        })
      );
    });

    expect(toastSuccess).toHaveBeenCalledWith("Pago registrado");
    expect(baseProps.onOpenChange).toHaveBeenCalledWith(false);
    expect(baseProps.onRegistered).toHaveBeenCalled();
  });

  it("usa la moneda de la cuenta elegida en la banda y el nuevo saldo", async () => {
    const user = userEvent.setup();
    renderDrawer();

    await pickMethod(user, "Transferencia BCP");
    await pickAccount(user, "Banco", "Banco USD · USD");

    const newBalanceLabel = screen.getByText("Nuevo saldo");
    expect(newBalanceLabel.parentElement).toHaveTextContent("$");
  });

  it("en compras pide proveedor y usa la categoría de egreso", async () => {
    const user = userEvent.setup();
    renderDrawer({
      direction: "EGRESO",
      entityName: "Ferretería El Sol EIRL",
      entityId: "p-1",
    });

    expect(screen.getByText("Proveedor:")).toBeInTheDocument();
    expect(await screen.findByText("Pago a proveedor")).toBeInTheDocument();

    await pickMethod(user, "Efectivo");
    await pickAccount(user, "Caja/Banco", "Caja General · PEN");
    await user.click(screen.getByRole("button", { name: "Registrar pago" }));

    await waitFor(() => {
      expect(addPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: "EGRESO",
          categoryId: "cat-pago",
        })
      );
    });
  });
});
