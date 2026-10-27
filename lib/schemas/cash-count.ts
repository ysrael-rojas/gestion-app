import { z } from "zod";

import { cashCloseDenominationsSchema } from "@/lib/schemas/cash-close";
import { getTodayLocalDate } from "@/lib/utils";

// Conteo opcional (bancos o arqueo simple); las cajas usan denominaciones.
const optionalCounted = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined
      ? undefined
      : Number(value),
  z
    .number()
    .nonnegative("El conteo no puede ser negativo.")
    .optional()
);

export const cashCountSchema = z
  .object({
    accountId: z.string().uuid("Selecciona una cuenta."),
    countDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
    countedBalance: optionalCounted,
    countedBy: z.string().trim().max(100).optional(),
    notes: z.string().trim().max(300).optional(),
    denominations: cashCloseDenominationsSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.countDate > getTodayLocalDate()) {
      ctx.addIssue({
        code: "custom",
        path: ["countDate"],
        message: "La fecha del arqueo no puede ser futura.",
      });
    }
  });

export type CashCountFormInput = z.input<typeof cashCountSchema>;
export type CashCountFormValues = z.output<typeof cashCountSchema>;
