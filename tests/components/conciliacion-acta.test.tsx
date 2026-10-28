import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import {
  ConciliacionActa,
  type ConciliacionActaData,
} from "@/components/cajas-bancos/conciliacion-acta";
import type { ReconciliationItem } from "@/lib/caja/conciliacion-tipos";

const items: ReconciliationItem[] = [
  { kind: "DEPOSITO_EN_TRANSITO", description: "Depósito 30/10", amount: 970 },
  { kind: "PAGO_NO_DEBITADO", description: "Pago proveedor", amount: 640 },
  { kind: "CARGO_NO_REGISTRADO", description: "ITF", amount: 15.3 },
  { kind: "ABONO_NO_REGISTRADO", description: "Intereses", amount: 4.6 },
];

const data = (
  overrides: Partial<ConciliacionActaData> = {}
): ConciliacionActaData => ({
  accountName: "Banco BCP",
  bankName: "BCP",
  accountNumber: "191-0001234-0-55",
  currency: "PEN",
  periodStart: "2026-10-01",
  periodEnd: "2026-10-31",
  statementBalance: 17955.3,
  booksBalance: 18420,
  preparedBy: "Ana Ríos",
  reviewedBy: "Luis Paredes",
  notes: "Conciliación de octubre",
  items,
  ...overrides,
});

function renderActa(props: Partial<ConciliacionActaData> = {}) {
  return render(
    <ConciliacionActa data={data(props)} open onClose={() => {}} />
  );
}

describe("ConciliacionActa", () => {
  beforeEach(() => {
    vi.spyOn(window, "print").mockImplementation(() => {});
  });

  it("imprime el formato oficial con las cuatro partidas y firmas", () => {
    renderActa();

    expect(
      screen.getByText("Acta de conciliación bancaria")
    ).toBeInTheDocument();
    expect(screen.getByText("BCP — Banco BCP")).toBeInTheDocument();
    expect(screen.getByText(/191-0001234-0-55/)).toBeInTheDocument();
    expect(
      screen.getByText(/01\/10\/2026 — 31\/10\/2026/)
    ).toBeInTheDocument();

    expect(
      screen.getByText("Saldo según extracto bancario").closest("tr")
    ).toHaveTextContent("S/ 17,955.30");
    expect(
      screen.getByText("(+) Depósito en tránsito").closest("tr")
    ).toHaveTextContent("S/ 970.00");
    expect(
      screen.getByText("(−) Pago girado y no debitado").closest("tr")
    ).toHaveTextContent("S/ 640.00");
    expect(
      screen.getByText("(−) Cargo del banco no registrado").closest("tr")
    ).toHaveTextContent("S/ 15.30");
    expect(
      screen.getByText("(+) Abono del banco no registrado").closest("tr")
    ).toHaveTextContent("S/ 4.60");
    expect(
      screen.getByText("Saldo conciliado (extracto ± partidas)").closest("tr")
    ).toHaveTextContent("S/ 18,274.60");
    expect(
      screen.getByText("Saldo según mis registros").closest("tr")
    ).toHaveTextContent("S/ 18,420.00");
    expect(screen.getByText("Diferencia").closest("tr")).toHaveTextContent(
      "S/ 145.40"
    );

    expect(screen.getByText("Resultado: Con diferencia")).toBeInTheDocument();
    expect(screen.getByText("Depósito 30/10")).toBeInTheDocument();
    expect(screen.getByText("ITF")).toBeInTheDocument();
    expect(screen.getByText("Elaborado por")).toBeInTheDocument();
    expect(screen.getByText("Ana Ríos")).toBeInTheDocument();
    expect(screen.getByText("Revisado por")).toBeInTheDocument();
    expect(screen.getByText("Luis Paredes")).toBeInTheDocument();
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("marca Conciliado cuando la diferencia es cero", () => {
    renderActa({ statementBalance: 18420, items: [] });

    expect(screen.getByText("Resultado: Conciliado")).toBeInTheDocument();
    expect(screen.getByText("Diferencia").closest("tr")).toHaveTextContent(
      "S/ 0.00"
    );
    expect(
      screen.getByText("(+) Depósito en tránsito").closest("tr")
    ).toHaveTextContent("S/ 0.00");
  });

  it("imprime las firmas en blanco cuando no se escribieron", () => {
    renderActa({ preparedBy: null, reviewedBy: null, notes: null });

    expect(screen.getByText("Elaborado por")).toBeInTheDocument();
    expect(screen.getByText("Revisado por")).toBeInTheDocument();
    expect(screen.queryByText(/Notas:/)).not.toBeInTheDocument();
  });

  it("no renderiza nada si el acta está cerrada", () => {
    render(
      <ConciliacionActa data={data()} open={false} onClose={() => {}} />
    );

    expect(
      screen.queryByText("Acta de conciliación bancaria")
    ).not.toBeInTheDocument();
    expect(window.print).not.toHaveBeenCalled();
  });
});
