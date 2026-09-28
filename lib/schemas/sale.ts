import { z } from "zod";

import type {
  PaymentType,
  SaleStatus,
  VoucherType,
} from "@/components/ventas/types";
import {
  PAYMENT_TYPES,
  SALE_STATUSES,
  VOUCHER_TYPES,
} from "@/lib/data/sale-options";

const voucherTypeEnum = z.enum(
  VOUCHER_TYPES.map((option) => option.value) as [VoucherType, ...VoucherType[]],
  { error: "Selecciona el tipo de comprobante" }
);

const paymentTypeEnum = z.enum(
  PAYMENT_TYPES.map((option) => option.value) as [PaymentType, ...PaymentType[]],
  { error: "Selecciona el tipo de pago" }
);

const saleStatusEnum = z.enum(
  SALE_STATUSES.map((option) => option.value) as [SaleStatus, ...SaleStatus[]],
  { error: "Selecciona el estado" }
);

export const saleSchema = z.object({
  issueDate: z.string().min(1, "La fecha de emisión es requerida"),
  voucherType: voucherTypeEnum,
  voucherNumber: z.string().min(1, "El número de comprobante es requerido"),
  clientId: z.string().min(1, "Selecciona un cliente"),
  total: z.coerce
    .number({ error: "Ingresa un total válido" })
    .positive("El total debe ser mayor a 0"),
  paymentType: paymentTypeEnum,
  status: saleStatusEnum,
});

export type SaleFormValues = z.output<typeof saleSchema>;
export type SaleFormInput = z.input<typeof saleSchema>;
