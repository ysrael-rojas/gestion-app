import type { PaymentStatus } from "@/components/pagos/types";

/**
 * Estado derivado del pago según su saldo pendiente de asignar (SPEC 48).
 * No se persiste: sale siempre de `payment_balance.unassigned_amount`.
 * SPEC 50 añade MOVIMIENTO: un recibo marcado `is_cash_movement` (movimiento
 * de caja, cargo bancario o vale) no se asigna a comprobantes.
 */
export type AssignState =
  | "POR_ASIGNAR"
  | "ASIGNADO"
  | "ANULADO"
  | "MOVIMIENTO";

export const ASSIGN_STATE_LABELS: Record<AssignState, string> = {
  POR_ASIGNAR: "Por asignar",
  ASIGNADO: "Asignado",
  ANULADO: "Anulado",
  MOVIMIENTO: "Movimiento de caja",
};

export function getAssignState(
  status: PaymentStatus,
  unassignedAmount: number,
  isCashMovement = false
): AssignState {
  if (status === "ANULADO") {
    return "ANULADO";
  }

  if (isCashMovement) {
    return "MOVIMIENTO";
  }

  return unassignedAmount > 0 ? "POR_ASIGNAR" : "ASIGNADO";
}
