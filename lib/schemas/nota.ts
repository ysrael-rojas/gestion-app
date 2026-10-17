import { z } from "zod";

import type { AdjustmentVoucherType } from "@/lib/data/nota-options";
import {
  ADJUSTMENT_VOUCHER_TYPES,
  NOTE_MOTIVES,
} from "@/lib/data/nota-options";
import { voucherNumberSchema } from "@/lib/schemas/voucher";

const voucherTypeEnum = z.enum(
  ADJUSTMENT_VOUCHER_TYPES.map((option) => option.value) as [
    AdjustmentVoucherType,
    ...AdjustmentVoucherType[],
  ],
  { error: "Selecciona el tipo de comprobante" }
);

/**
 * Nota de crédito/débito o comprobante de retención: siempre referencia un
 * comprobante base. El motivo es obligatorio en NC/ND (catálogo SUNAT) y la
 * retención no lo lleva. La entidad no se elige: se hereda del referenciado.
 */
export const notaSchema = z
  .object({
    issueDate: z.string().min(1, "La fecha de emisión es requerida"),
    voucherType: voucherTypeEnum,
    voucherNumber: voucherNumberSchema,
    total: z.coerce
      .number({ error: "Ingresa un total válido" })
      .positive("El total debe ser mayor a 0"),
    motiveCode: z.string().optional(),
    referencedComprobanteId: z
      .string()
      .min(1, "Selecciona el comprobante referenciado"),
  })
  .superRefine((values, ctx) => {
    if (values.voucherType === "COMPROBANTE_RETENCION") {
      if (values.motiveCode) {
        ctx.addIssue({
          code: "custom",
          path: ["motiveCode"],
          message: "El comprobante de retención no lleva motivo",
        });
      }
      return;
    }

    if (!values.motiveCode) {
      ctx.addIssue({
        code: "custom",
        path: ["motiveCode"],
        message: "Selecciona el motivo de la nota",
      });
      return;
    }

    const motives = NOTE_MOTIVES[values.voucherType];
    if (!motives.some((motive) => motive.value === values.motiveCode)) {
      ctx.addIssue({
        code: "custom",
        path: ["motiveCode"],
        message: "El motivo no pertenece al catálogo de la nota",
      });
    }
  });

export type NotaFormValues = z.output<typeof notaSchema>;
export type NotaFormInput = z.input<typeof notaSchema>;
