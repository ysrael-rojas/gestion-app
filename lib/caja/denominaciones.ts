// Denominaciones del sol peruano para el arqueo de caja (S/ 200 → S/ 0.10).
//
// El orden sigue el formato estándar de arqueo: de la denominación mayor a la
// menor. Es la única fuente de verdad en el cliente; la base de datos valida el
// mismo conjunto en `cash_close_denomination`.
export const PEN_DENOMINATIONS = [
  200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1,
] as const;

export type PenDenomination = (typeof PEN_DENOMINATIONS)[number];

export interface DenominationCount {
  denomination: number;
  quantity: number;
}

export function isPenDenomination(value: number): value is PenDenomination {
  return (PEN_DENOMINATIONS as readonly number[]).includes(value);
}

/** Etiqueta legible: 200 → "S/ 200", 0.5 → "S/ 0.50". */
export function formatDenomination(denomination: number): string {
  return `S/ ${Number.isInteger(denomination) ? denomination : denomination.toFixed(2)}`;
}

/** Billetes desde S/ 2; monedas por debajo. */
export function denominationKind(denomination: number): "Billete" | "Moneda" {
  return denomination >= 2 ? "Billete" : "Moneda";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Suma de subtotales del conteo (denominación × cantidad). Ignora las filas sin
 * cantidad. Redondea a 2 decimales para no arrastrar ruido de punto flotante
 * (0.1 + 0.2 ≠ 0.3).
 */
export function sumDenominationCounts(
  counts:
    | { denomination: number; quantity?: number | null }[]
    | null
    | undefined
): number {
  if (!counts) {
    return 0;
  }

  return round2(
    counts.reduce(
      (total, row) => total + row.denomination * (row.quantity ?? 0),
      0
    )
  );
}

/**
 * Filas efectivamente contadas (> 0) en el formato que espera la RPC
 * `close_cash_account` (`p_denominations`).
 */
export function toDenominationPayload(
  counts:
    | { denomination: number; quantity?: number | null }[]
    | null
    | undefined
): DenominationCount[] {
  if (!counts) {
    return [];
  }

  return counts
    .filter((row) => (row.quantity ?? 0) > 0)
    .map((row) => ({ denomination: row.denomination, quantity: row.quantity ?? 0 }));
}

/**
 * Efectivo neto en caja = total contado − fondo de cambio. Puede ser negativo
 * si el conteo no alcanza el fondo (señal de faltante).
 */
export function netCash(
  total: number,
  changeFund: number | null | undefined
): number {
  return round2(total - (changeFund ?? 0));
}
