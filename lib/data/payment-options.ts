import type {
  PaymentDirection,
  PaymentMethod,
  PaymentStatus,
} from "@/components/pagos/types";
import type { SelectOption } from "@/lib/data/sale-options";

export const PAYMENT_DIRECTIONS: SelectOption<PaymentDirection>[] = [
  { value: "INGRESO", label: "Ingreso" },
  { value: "EGRESO", label: "Egreso" },
];

export const PAYMENT_METHODS: SelectOption<PaymentMethod>[] = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TRANSFERENCIA_BCP", label: "Transferencia BCP" },
  { value: "TARJETA_CREDITO", label: "Tarjeta de crédito" },
];

export const PAYMENT_STATUSES: SelectOption<PaymentStatus>[] = [
  { value: "REGISTRADO", label: "Registrado" },
  { value: "ANULADO", label: "Anulado" },
];

export const DEFAULT_PAYMENT_METHOD: PaymentMethod = "EFECTIVO";
