import type { PaymentDirection } from "@/components/pagos/types";
import type { CashAccountType } from "@/lib/schemas/cash-account";
import { round2 } from "@/lib/utils";

/** Fila mínima de un movimiento de caja para agregar el resultado del mes. */
export interface FlowLike {
  direction: PaymentDirection;
  amount: number;
}

/** Fila mínima de una posición para agregar el disponible total. */
export interface PositionLike {
  type: CashAccountType;
  balance: number;
}

export interface CashFlowTotals {
  income: number;
  expense: number;
  /** Ingresos − egresos. Puede ser negativo. */
  net: number;
}

export interface PositionsSummary {
  total: number;
  cashTotal: number;
  bankTotal: number;
  count: number;
}

/**
 * Primer y último día del mes de `today` (ISO `YYYY-MM-DD`), pensado para
 * consultar los movimientos del período sin depender de zonas horarias.
 */
export function getMonthRange(today: string): { start: string; end: string } {
  const [year, month] = today.split("-");
  const lastDay = new Date(Number(year), Number(month), 0).getDate();

  return {
    start: `${year}-${month}-01`,
    end: `${year}-${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** Suma ingresos y egresos del período; el neto es ingresos − egresos. */
export function summarizeCashFlow(rows: FlowLike[]): CashFlowTotals {
  let income = 0;
  let expense = 0;

  for (const row of rows) {
    if (row.direction === "INGRESO") {
      income += row.amount;
    } else if (row.direction === "EGRESO") {
      expense += row.amount;
    }
  }

  income = round2(income);
  expense = round2(expense);

  return { income, expense, net: round2(income - expense) };
}

/** Total disponible y su desglose por tipo de cuenta (caja vs. banco). */
export function summarizePositions(positions: PositionLike[]): PositionsSummary {
  let total = 0;
  let cashTotal = 0;
  let bankTotal = 0;

  for (const position of positions) {
    total += position.balance;
    if (position.type === "CASH_BOX") {
      cashTotal += position.balance;
    } else {
      bankTotal += position.balance;
    }
  }

  return {
    total: round2(total),
    cashTotal: round2(cashTotal),
    bankTotal: round2(bankTotal),
    count: positions.length,
  };
}
