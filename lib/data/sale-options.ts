import type {
  PaymentType,
  SaleStatus,
  VoucherType,
} from "@/components/ventas/types";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export const VOUCHER_TYPES: SelectOption<VoucherType>[] = [
  { value: "FACTURA", label: "Factura" },
  { value: "BOLETA", label: "Boleta" },
  { value: "NOTA_VENTA", label: "Nota de venta" },
];

export const PAYMENT_TYPES: SelectOption<PaymentType>[] = [
  { value: "CONTADO", label: "Contado" },
  { value: "CREDITO", label: "Crédito" },
];

export const SALE_STATUSES: SelectOption<SaleStatus>[] = [
  { value: "PAGADO", label: "Pagado" },
  { value: "PENDIENTE", label: "Pendiente" },
];

export const DEFAULT_SALE_STATUS: SaleStatus = "PENDIENTE";

export function getOptionLabel<T extends string>(
  options: SelectOption<T>[],
  value: T
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}
