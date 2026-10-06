import { z } from "zod";

export const cashReceiptCategorySchema = z.object({
  direction: z.enum(["INGRESO", "EGRESO"]),
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(60),
  isActive: z.boolean().default(true),
});

export type CashReceiptCategoryFormInput = z.input<
  typeof cashReceiptCategorySchema
>;
export type CashReceiptCategoryFormValues = z.output<
  typeof cashReceiptCategorySchema
>;
