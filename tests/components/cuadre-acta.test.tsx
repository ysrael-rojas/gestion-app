import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { CuadreActa } from "@/components/cajas-bancos/cuadre-acta";
import type { CashClose, Payment } from "@/components/pagos/types";

const close = (overrides: Partial<CashClose> = {}): CashClose => ({
  id: "close-1",
  cashAccountId: "acc-1",
  periodicity: "DAILY",
  periodStart: "2026-10-01",
  periodEnd: "2026-10-14",
  openingBalance: 0,
  incomeTotal: 300,
  expenseTotal: 0,
  expectedBalance: 300,
  transferInTotal: 0,
  transferOutTotal: 0,
  countedBalance: 300,
  changeFund: 100,
  difference: 0,
  differenceReason: null,
  differenceTolerance: 0.5,
  countedBy: "Ana Ríos",
  verifiedBy: "Luis Torres",
  penUsdRate: null,
  notes: "Cierre del día",
  createdAt: "2026-10-14T00:00:00Z",
  ...overrides,
});

const payment = (overrides: Partial<Payment> = {}): Payment => ({
  id: "pay-1",
  entityId: null,
  direction: "INGRESO",
  paymentDate: "2026-10-05",
  receiptNumber: "RI-000001",
  amount: 100,
  currency: "PEN",
  methodId: "m-1",
  methodName: "Efectivo",
  cashAccountId: "acc-1",
  cashAccountName: "Caja principal",
  categoryId: "cat-1",
  categoryName: "Cobranza de venta",
  reference: null,
  status: "EN_REVISION",
  voidReason: null,
  voidedAt: null,
  notes: null,
  isCashMovement: false,
  ...overrides,
});

function renderActa(props: {
  close?: Partial<CashClose>;
  accountType?: "CASH_BOX" | "BANK_ACCOUNT";
  statement?: Payment[];
}) {
  return render(
    <CuadreActa
      close={close(props.close)}
      accountName="Caja principal"
      accountType={props.accountType ?? "CASH_BOX"}
      currency="PEN"
      denominations={[{ denomination: 100, quantity: 3 }]}
      statement={
        props.statement ?? [
          payment({ receiptNumber: "RI-000001" }),
          payment({
            id: "pay-2",
            receiptNumber: "RI-000005",
            status: "ANULADO",
          }),
        ]
      }
      open
      onClose={() => {}}
    />
  );
}

describe("CuadreActa", () => {
  beforeEach(() => {
    vi.spyOn(window, "print").mockImplementation(() => {});
  });

  it("imprime el acta de una caja con A/B/A−B, resultado y firmas", () => {
    renderActa({});

    expect(screen.getByText("Acta de arqueo de caja")).toBeInTheDocument();
    expect(screen.getByText("Caja principal")).toBeInTheDocument();
    expect(
      screen.getByText("Total valores en caja (A)").closest("tr")
    ).toHaveTextContent("S/ 300.00");
    expect(
      screen.getByText("Menos fondo de cambio (B)").closest("tr")
    ).toHaveTextContent("S/ 100.00");
    expect(
      screen.getByText("Efectivo neto (A − B)").closest("tr")
    ).toHaveTextContent("S/ 200.00");
    expect(
      screen.getByText("Saldo según registros (C)").parentElement
    ).toHaveTextContent("S/ 300.00");
    expect(screen.getByText("Cuadrado")).toBeInTheDocument();
    expect(screen.getByText("RI-000001 → RI-000005")).toBeInTheDocument();
    expect(screen.getByText("Firma del cajero")).toBeInTheDocument();
    expect(screen.getByText("Ana Ríos")).toBeInTheDocument();
    expect(screen.getByText("Firma del arqueador")).toBeInTheDocument();
    expect(screen.getByText("Luis Torres")).toBeInTheDocument();
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("en un banco no muestra denominaciones y usa el saldo según extracto", () => {
    renderActa({ accountType: "BANK_ACCOUNT" });

    expect(
      screen.getByText("Cuadre de cuenta bancaria")
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Total valores en caja (A)")
    ).not.toBeInTheDocument();
    expect(screen.getByText("Saldo según extracto")).toBeInTheDocument();
  });

  it("un cierre histórico sin nombres imprime las firmas en blanco", () => {
    renderActa({ close: { countedBy: null, verifiedBy: null } });

    expect(screen.getByText("Firma del cajero")).toBeInTheDocument();
    expect(screen.getByText("Firma del arqueador")).toBeInTheDocument();
    expect(screen.queryByText("Ana Ríos")).not.toBeInTheDocument();
    expect(screen.queryByText("Luis Torres")).not.toBeInTheDocument();
  });

  it("muestra la tolerancia y el motivo cuando existen", () => {
    renderActa({
      close: {
        difference: -5,
        differenceReason: "Faltante por vuelto",
      },
    });

    expect(screen.getByText("Faltante")).toBeInTheDocument();
    expect(screen.getByText("Faltante por vuelto")).toBeInTheDocument();
    expect(screen.getByText(/Tolerancia:/)).toBeInTheDocument();
  });
});
