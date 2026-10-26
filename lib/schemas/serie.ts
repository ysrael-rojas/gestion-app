import { z } from "zod";

import type { VoucherType } from "@/components/comprobantes/types";
import { SERIES_VOUCHER_TYPES } from "@/lib/data/series-options";

/** Serie SUNAT: 1 a 4 caracteres alfanuméricos, por ejemplo `F001`. */
export const SERIES_CODE_PATTERN = /^[A-Za-z0-9]{1,4}$/;

const seriesVoucherTypeEnum = z.enum(
  SERIES_VOUCHER_TYPES.map((option) => option.value) as [
    VoucherType,
    ...VoucherType[],
  ],
  { error: "Selecciona el tipo de comprobante" }
);

/**
 * Alta y edición de una serie de comprobante. El correlativo no se edita aquí:
 * nace en 0 y avanza solo al registrar comprobantes (SPEC 44).
 */
export const serieFormSchema = z.object({
  voucherType: seriesVoucherTypeEnum,
  code: z
    .string()
    .trim()
    .min(1, "El código de serie es requerido")
    .regex(
      SERIES_CODE_PATTERN,
      "Usa 1 a 4 caracteres alfanuméricos, por ejemplo F001"
    ),
  isDefault: z.boolean(),
});

export type SerieFormValues = z.output<typeof serieFormSchema>;
export type SerieFormInput = z.input<typeof serieFormSchema>;
