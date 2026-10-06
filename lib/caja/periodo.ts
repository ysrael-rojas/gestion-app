import type { ClosingPeriodicity } from "@/components/pagos/types";

// Helpers puros y testeables del cuadre de caja (sin dependencias de Supabase).

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(value: string, days: number): string {
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

// Fin de período sugerido según la periodicidad, usando la fecha de hoy.
//   DAILY   → ayer
//   WEEKLY  → el domingo anterior
//   MONTHLY → el último día del mes anterior
export function suggestedPeriodEnd(
  periodicity: ClosingPeriodicity,
  today: string
): string {
  const date = parseIsoDate(today);

  if (periodicity === "DAILY") {
    date.setUTCDate(date.getUTCDate() - 1);
  } else if (periodicity === "WEEKLY") {
    const day = date.getUTCDay(); // 0 = domingo
    const back = day === 0 ? 7 : day;
    date.setUTCDate(date.getUTCDate() - back);
  } else {
    // MONTHLY: día 0 del mes actual = último día del mes anterior.
    date.setUTCDate(0);
  }

  return toIsoDate(date);
}

// Diferencia de arqueo (espeja el cálculo de la RPC close_cash_account).
export function computeCashDifference(
  counted: number | null,
  expected: number
): number | null {
  if (counted === null) {
    return null;
  }

  return Math.round((counted - expected) * 100) / 100;
}
