import { z } from "zod";

export const paymentMethodSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "El código es obligatorio.")
    .max(40, "El código no puede superar 40 caracteres.")
    .transform((value) => value.toUpperCase().replace(/\s+/g, "_")),
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(60),
  isActive: z.boolean().default(true),
});

export type PaymentMethodFormInput = z.input<typeof paymentMethodSchema>;
export type PaymentMethodFormValues = z.output<typeof paymentMethodSchema>;
