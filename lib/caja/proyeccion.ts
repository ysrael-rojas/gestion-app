import type { VoucherBalance } from "@/components/pagos/types";
import { addDays } from "@/lib/caja/periodo";
import { round2 } from "@/lib/utils";

/** Cantidad de semanas que se proyectan (SPEC 52). */
export const PROJECTION_WEEKS = 4;

/** Lunes de la semana de `today` (semanas de lunes a domingo). */
export function startOfWeek(today: string): string {
  const day = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = domingo
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(today, offset);
}

export interface ProjectionWeek {
  index: number;
  start: string;
  end: string;
  overdueCollections: number;
  overduePayments: number;
  collections: number;
  payments: number;
  closingBalance: number;
}

export interface CashFlowProjection {
  currentBalance: number;
  weeks: ProjectionWeek[];
  /** Crédito sin fecha de vencimiento: se muestra aparte y no suma. */
  unassigned: { collections: number; payments: number };
  hasNegativeWeek: boolean;
  firstNegativeWeekIndex: number | null;
}

export interface ProjectionInput {
  today: string;
  /** Disponible hoy, ya consolidado en soles. */
  currentBalance: number;
  receivables: VoucherBalance[];
  payables: VoucherBalance[];
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86400000
  );
}

/**
 * Reparte los comprobantes pendientes en 4 semanas (lunes-domingo) desde la
 * semana en curso y calcula el saldo final en cascada (SPEC 52).
 *
 * - Vencidos (vencimiento anterior al lunes actual, incluido el contado con
 *   saldo) suman en la semana 1 como "atrasado".
 * - Crédito sin fecha no tiene semana: va a `unassigned` y no suma.
 * - Lo que vence después de la semana 4 queda fuera de la proyección.
 */
export function buildCashFlowProjection(
  input: ProjectionInput
): CashFlowProjection {
  const firstMonday = startOfWeek(input.today);
  const weeks: ProjectionWeek[] = Array.from(
    { length: PROJECTION_WEEKS },
    (_, index) => {
      const start = addDays(firstMonday, index * 7);

      return {
        index,
        start,
        end: addDays(start, 6),
        overdueCollections: 0,
        overduePayments: 0,
        collections: 0,
        payments: 0,
        closingBalance: 0,
      };
    }
  );
  const unassigned = { collections: 0, payments: 0 };

  function addRows(rows: VoucherBalance[], kind: "collection" | "payment") {
    for (const row of rows) {
      if (row.balance <= 0) {
        continue;
      }

      if (!row.effectiveDueDate) {
        if (kind === "collection") {
          unassigned.collections += row.balance;
        } else {
          unassigned.payments += row.balance;
        }
        continue;
      }

      if (row.effectiveDueDate < firstMonday) {
        if (kind === "collection") {
          weeks[0].overdueCollections += row.balance;
        } else {
          weeks[0].overduePayments += row.balance;
        }
        continue;
      }

      const offset = Math.floor(
        daysBetween(firstMonday, row.effectiveDueDate) / 7
      );

      // Más allá del horizonte: no se proyecta (la vista cubre 4 semanas).
      if (offset < 0 || offset >= PROJECTION_WEEKS) {
        continue;
      }

      if (kind === "collection") {
        weeks[offset].collections += row.balance;
      } else {
        weeks[offset].payments += row.balance;
      }
    }
  }

  addRows(input.receivables, "collection");
  addRows(input.payables, "payment");

  let balance = round2(input.currentBalance);

  for (const week of weeks) {
    week.overdueCollections = round2(week.overdueCollections);
    week.overduePayments = round2(week.overduePayments);
    week.collections = round2(week.collections);
    week.payments = round2(week.payments);
    week.closingBalance = round2(
      balance +
        week.overdueCollections -
        week.overduePayments +
        week.collections -
        week.payments
    );
    balance = week.closingBalance;
  }

  const firstNegative = weeks.find((week) => week.closingBalance < 0);

  return {
    currentBalance: round2(input.currentBalance),
    weeks,
    unassigned: {
      collections: round2(unassigned.collections),
      payments: round2(unassigned.payments),
    },
    hasNegativeWeek: Boolean(firstNegative),
    firstNegativeWeekIndex: firstNegative?.index ?? null,
  };
}
