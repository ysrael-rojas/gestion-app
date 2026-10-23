import { z } from "zod";

import type {
  PaymentType,
  VoucherStatus,
  VoucherType,
} from "@/components/comprobantes/types";
import {
  PAYMENT_TYPES,
  SALE_STATUSES,
  VOUCHER_TYPES,
} from "@/lib/data/sale-options";

/**
 * Serie + correlativo del comprobante (SUNAT): hasta 4 caracteres alfanuméricos de
 * serie, un guion y el correlativo numérico. Ejemplo: `F001-000001`.
 * Se valida solo en la app: un CHECK en la base rompería comprobantes históricos.
 */
export const VOUCHER_NUMBER_PATTERN = /^[A-Za-z0-9]{1,4}-\d{1,8}$/;

/**
 * Número de comprobante: recorta espacios y exige el formato serie-correlativo.
 * Compartido por ventas, compras, notas y retenciones.
 */
export const voucherNumberSchema = z
  .string()
  .trim()
  .min(1, "El número de comprobante es requerido")
  .regex(
    VOUCHER_NUMBER_PATTERN,
    "Usa el formato serie-correlativo, por ejemplo F001-000001"
  );

const voucherTypeEnum = z.enum(
  VOUCHER_TYPES.map((option) => option.value) as [
    VoucherType,
    ...VoucherType[],
  ],
  { error: "Selecciona el tipo de comprobante" }
);

const paymentTypeEnum = z.enum(
  PAYMENT_TYPES.map((option) => option.value) as [PaymentType, ...PaymentType[]],
  { error: "Selecciona el tipo de pago" }
);

const voucherStatusEnum = z.enum(
  SALE_STATUSES.map((option) => option.value) as [
    VoucherStatus,
    ...VoucherStatus[],
  ],
  { error: "Selecciona el estado" }
);

/**
 * Schema único del formulario de comprobantes de venta y compra. Usa el campo
 * `entityId` para cliente o proveedor; la vista lo mapea al payload de cada
 * módulo (`entityId` en ventas, `supplierId` en compras).
 */
export const voucherFormSchema = z
  .object({
    issueDate: z.string().min(1, "La fecha de emisión es requerida"),
    voucherType: voucherTypeEnum,
    voucherNumber: voucherNumberSchema,
    entityId: z.string().min(1, "Selecciona el cliente o proveedor"),
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
    status: voucherStatusEnum,
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

export type VoucherFormValues = z.output<typeof voucherFormSchema>;
export type VoucherFormInput = z.input<typeof voucherFormSchema>;
