import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const downloadCsv = vi.hoisted(() => vi.fn());

vi.mock("@/lib/caja/csv", async () => {
  const actual = await vi.importActual<typeof import("@/lib/caja/csv")>(
    "@/lib/caja/csv"
  );
  return { ...actual, downloadCsv };
});

import { CuadreReport } from "@/components/cajas-bancos/cuadre-report";
import type { CashClose } from "@/components/pagos/types";

const close = (overrides: Partial<CashClose> = {}): CashClose => ({
  id: "close-1",
  cashAccountId: "acc-1",
  periodicity: "DAILY",
  periodStart: "2026-10-01",
  periodEnd: "2026-10-14",
  openingBalance: 0,
  incomeTotal: 500,
  expenseTotal: 0,
  expectedBalance: 500,
  countedBalance: 400.5,
  changeFund: null,
  difference: -99.5,
  penUsdRate: null,
  notes: null,
  createdAt: "2026-10-14T00:00:00Z",
  ...overrides,
});

function renderReport(props: {
  denominations?: { denomination: number; quantity: number }[];
  changeFund?: number;
  accountType?: "CASH_BOX" | "BANK_ACCOUNT";
}) {
  return render(
    <CuadreReport
      close={close()}
      statement={[]}
      transfers={[]}
      accountId="acc-1"
      accountName="Caja principal"
      currency="PEN"
      accountType={props.accountType ?? "CASH_BOX"}
      denominations={props.denominations ?? []}
      changeFund={props.changeFund ?? 0}
    />
  );
}

describe("CuadreReport", () => {
  beforeEach(() => {
    downloadCsv.mockClear();
  });

  it("muestra la tabla de denominaciones con su subtotal", () => {
    renderReport({
      denominations: [
        { denomination: 100, quantity: 3 },
        { denomination: 50, quantity: 2 },
        { denomination: 0.5, quantity: 1 },
      ],
      changeFund: 100,
    });

    const arqueo = screen.getByRole("heading", {
      name: "Arqueo por denominación",
    }).parentElement as HTMLElement;

    // Encabezado + una fila por denominación contada.
    const rows = within(arqueo).getAllByRole("row");
    expect(rows).toHaveLength(4);
    // Fila de S/ 100: cantidad 3 y subtotal S/ 300.00.
    expect(rows[1]).toHaveTextContent("S/ 100");
    expect(rows[1]).toHaveTextContent("3");
    expect(rows[1]).toHaveTextContent("S/ 300.00");
    // Fila de la moneda de S/ 0.50.
    expect(rows[3]).toHaveTextContent("S/ 0.50");
  });

  it("cierra el arqueo con total, fondo de cambio y efectivo neto", () => {
    renderReport({
      denominations: [
        { denomination: 100, quantity: 3 },
        { denomination: 50, quantity: 2 },
        { denomination: 0.5, quantity: 1 },
      ],
      changeFund: 100,
    });

    expect(screen.getByText("Total valores en caja (A)")).toBeInTheDocument();
    expect(screen.getByText("Total valores en caja (A)").parentElement).toHaveTextContent(
      "S/ 400.50"
    );
    expect(screen.getByText("Menos fondo de cambio (B)")).toBeInTheDocument();
    expect(
      screen.getByText("Menos fondo de cambio (B)").parentElement
    ).toHaveTextContent("S/ 100.00");
    expect(screen.getByText("Efectivo neto (A − B)")).toBeInTheDocument();
    expect(screen.getByText("Efectivo neto (A − B)").parentElement).toHaveTextContent(
      "S/ 300.50"
    );
  });

  it("no muestra el bloque de arqueo en un banco sin denominaciones ni fondo", () => {
    renderReport({ denominations: [], changeFund: 0 });

    expect(
      screen.queryByRole("heading", { name: "Arqueo por denominación" })
    ).not.toBeInTheDocument();
  });

  it("incluye el arqueo y el fondo de cambio en el CSV exportado", async () => {
    const user = userEvent.setup();

    renderReport({
      denominations: [
        { denomination: 100, quantity: 3 },
        { denomination: 0.5, quantity: 1 },
      ],
      changeFund: 100,
    });

    await user.click(screen.getByRole("button", { name: /Exportar CSV/ }));

    expect(downloadCsv).toHaveBeenCalledTimes(1);
    const [filename, csv] = downloadCsv.mock.calls[0] as [string, string];

    expect(filename).toBe("cuadre-Caja principal-2026-10-14.csv");
    expect(csv).toContain("Arqueo por denominación");
    expect(csv).toContain("S/ 100,3,300");
    expect(csv).toContain("Total valores en caja (A),,300.5");
    expect(csv).toContain("Menos fondo de cambio (B),,100");
    expect(csv).toContain("Efectivo neto (A − B),,200.5");
  });
});
