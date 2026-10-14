import type { BankChargeFormValues } from "@/lib/schemas/bank-charge";
import type { PaymentFormValues } from "@/lib/schemas/payment";

/**
 * Un cargo bancario (ITF, comisión, detracción) se registra como un recibo de
 * egreso sin entidad ni asignaciones: no paga una factura, lo descuenta el
 * banco de la cuenta (SPEC 33).
 */
export function bankChargeToPayment(
  values: BankChargeFormValues
): PaymentFormValues {
  return {
    entityId: undefined,
    direction: "EGRESO",
    paymentDate: values.chargeDate,
    amount: values.amount,
    methodId: values.methodId,
    cashAccountId: values.cashAccountId,
    categoryId: values.categoryId,
    reference: values.reference,
    notes: values.notes,
    allocations: [],
  };
}
