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

export const saleSchema = z
  .object({
    issueDate: z.string().min(1, "La fecha de emisión es requerida"),
    voucherType: voucherTypeEnum,
    voucherNumber: z.string().min(1, "El número de comprobante es requerido"),
    entityId: z.string().min(1, "Selecciona un cliente"),
    total: z.coerce
      .number({ error: "Ingresa un total válido" })
      .positive("El total debe ser mayor a 0"),
    paymentType: paymentTypeEnum,
    creditDays: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.coerce
        .number({ error: "Ingresa un número válido de días" })
        .int("Los días de crédito deben ser un número entero")
        .min(1, "Los días de crédito deben ser al menos 1")
        .optional()
    ),
    status: saleStatusEnum,
  })
  .superRefine((values, ctx) => {
    if (values.paymentType === "CREDITO" && values.creditDays == null) {
      ctx.addIssue({
        code: "custom",
        path: ["creditDays"],
        message: "Ingresa los días de crédito",
      });
    }
  });

export type SaleFormValues = z.output<typeof saleSchema>;
export type SaleFormInput = z.input<typeof saleSchema>;
