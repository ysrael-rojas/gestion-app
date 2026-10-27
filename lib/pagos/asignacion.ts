import type { PaymentStatus } from "@/components/pagos/types";

/**
 * Estado derivado del pago según su saldo pendiente de asignar (SPEC 48).
 * No se persiste: sale siempre de `payment_balance.unassigned_amount`.
 */
export type AssignState = "POR_ASIGNAR" | "ASIGNADO" | "ANULADO";

export const ASSIGN_STATE_LABELS: Record<AssignState, string> = {
  POR_ASIGNAR: "Por asignar",
  ASIGNADO: "Asignado",
  ANULADO: "Anulado",
};

export function getAssignState(
  status: PaymentStatus,
  unassignedAmount: number
): AssignState {
  if (status === "ANULADO") {
    return "ANULADO";
  }

  return unassignedAmount > 0 ? "POR_ASIGNAR" : "ASIGNADO";
}
