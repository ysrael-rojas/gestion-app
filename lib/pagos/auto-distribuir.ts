import type { VoucherBalance } from "@/components/pagos/types";

/**
 * Auto-distribuye un importe sobre los comprobantes con saldo, cubriendo
 * primero las deudas más antiguas (FIFO por antigüedad).
 *
 * Reglas:
 * - Ordena por `effectiveDueDate ?? issueDate` ascendente; empate por `issueDate`.
 * - Asigna `min(balance, restante)` a cada comprobante hasta agotar el importe.
 * - El excedente (importe mayor a la suma de saldos) NO se asigna.
 * - Trabaja en centavos enteros (`Math.round(x * 100)`) para evitar drift de
 *   redondeo: el último comprobante cubierto recibe el remanente exacto.
 *
 * Devuelve solo comprobantes con asignación > 0, mapeados
 * `comprobanteId -> monto asignado` en unidades monetarias (no centavos).
 */
export function distributeOldestFirst(
  vouchers: VoucherBalance[],
  amountToApply: number
): Map<string, number> {
  const assignments = new Map<string, number>();
  let remainingCents = Math.round(amountToApply * 100);

  if (remainingCents <= 0) {
    return assignments;
  }

  const sortedByAge = vouchers
    .filter((voucher) => voucher.balance > 0)
    .sort((a, b) => {
      const aDate = a.effectiveDueDate ?? a.issueDate;
      const bDate = b.effectiveDueDate ?? b.issueDate;

      if (aDate !== bDate) {
        return aDate < bDate ? -1 : 1;
      }

      if (a.issueDate !== b.issueDate) {
        return a.issueDate < b.issueDate ? -1 : 1;
      }

      return 0;
    });

  for (const voucher of sortedByAge) {
    if (remainingCents <= 0) {
      break;
    }

    const balanceCents = Math.round(voucher.balance * 100);
    // El último comprobante cubierto recibe el remanente exacto.
    const appliedCents = Math.min(balanceCents, remainingCents);

    if (appliedCents <= 0) {
      continue;
    }

    assignments.set(voucher.comprobanteId, appliedCents / 100);
    remainingCents -= appliedCents;
  }

  return assignments;
}
