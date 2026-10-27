import { round2 } from "@/lib/utils";

export interface ReceiptRange {
  prefix: string;
  first: string;
  last: string;
  count: number;
}

export interface ReceiptSequenceSummary {
  ranges: ReceiptRange[];
  annulled: number;
}

/**
 * Secuencia de recibos de un período para el acta/arqueo (SPEC 49): primer y
 * último número por prefijo (RI/RE) y cantidad de anulados. Los pagos sin
 * número (datos históricos) se ignoran.
 */
export function summarizeReceiptSequence(
  payments: Array<{ receiptNumber: string; status: string }>
): ReceiptSequenceSummary {
  const numbersByPrefix = new Map<string, string[]>();

  for (const payment of payments) {
    const receiptNumber = payment.receiptNumber?.trim();

    if (!receiptNumber) {
      continue;
    }

    const prefix = `${receiptNumber.split("-")[0]}-`;
    const numbers = numbersByPrefix.get(prefix) ?? [];
    numbers.push(receiptNumber);
    numbersByPrefix.set(prefix, numbers);
  }

  const ranges = [...numbersByPrefix.entries()]
    .map(([prefix, numbers]) => {
      const sorted = [...numbers].sort();

      return {
        prefix,
        first: sorted[0],
        last: sorted[sorted.length - 1],
        count: sorted.length,
      };
    })
    .sort((a, b) => a.prefix.localeCompare(b.prefix));

  return {
    ranges,
    annulled: payments.filter((payment) => payment.status === "ANULADO")
      .length,
  };
}

/** "RI-000012 → RI-000031 · RE-000004 → RE-000006" o "—" si no hay recibos. */
export function formatReceiptRanges(summary: ReceiptSequenceSummary): string {
  if (summary.ranges.length === 0) {
    return "—";
  }

  return summary.ranges
    .map((range) =>
      range.first === range.last
        ? range.first
        : `${range.first} → ${range.last}`
    )
    .join(" · ");
}

export interface StatementSummary {
  income: number;
  expense: number;
  movements: number;
  transfers: number;
}

/**
 * Totales del extracto (SPEC 51): los anulados se listan pero no suman.
 * Las transferencias no tienen dirección contable propia aquí: solo se cuentan.
 */
export function summarizeStatement(
  statement: Array<{ direction: string; amount: number; status: string }>,
  transfers: unknown[]
): StatementSummary {
  let income = 0;
  let expense = 0;
  let movements = 0;

  for (const row of statement) {
    if (row.status === "ANULADO") {
      continue;
    }

    movements += 1;

    if (row.direction === "INGRESO") {
      income += row.amount;
    } else {
      expense += row.amount;
    }
  }

  return {
    income: round2(income),
    expense: round2(expense),
    movements,
    transfers: transfers.length,
  };
}
