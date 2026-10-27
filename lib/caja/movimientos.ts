import type { PaymentFormValues } from "@/lib/schemas/payment";
import type { CashMovementFormValues } from "@/lib/schemas/cash-movement";

/**
 * Un movimiento de caja es un recibo sin entidad ni asignaciones que nunca se
 * ofrece para asignar a comprobantes (SPEC 50). Espejo de `bankChargeToPayment`
 * pero con la dirección elegida por el usuario.
 */
export function cashMovementToPayment(
  values: CashMovementFormValues
): PaymentFormValues {
  return {
    entityId: undefined,
    direction: values.direction,
    paymentDate: values.movementDate,
    amount: values.amount,
    methodId: values.methodId,
    cashAccountId: values.cashAccountId,
    categoryId: values.categoryId,
    reference: values.reference,
    notes: values.notes,
    allocations: [],
    isCashMovement: true,
  };
}
