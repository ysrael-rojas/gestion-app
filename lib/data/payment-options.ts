import type {
  PaymentDirection,
  PaymentStatus,
} from "@/components/pagos/types";
import type { SelectOption } from "@/lib/data/sale-options";

export const PAYMENT_DIRECTIONS: SelectOption<PaymentDirection>[] = [
  { value: "INGRESO", label: "Ingreso" },
  { value: "EGRESO", label: "Egreso" },
];

export const PAYMENT_STATUSES: SelectOption<PaymentStatus>[] = [
  { value: "REGISTRADO", label: "Registrado" },
  { value: "ANULADO", label: "Anulado" },
];
