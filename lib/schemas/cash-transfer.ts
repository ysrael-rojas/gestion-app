import { z } from "zod";

// Transferencia entre dos cuentas (caja/banco) del mismo dueño, en PEN.
export const cashTransferSchema = z
  .object({
    sourceAccountId: z.string().uuid("Selecciona la cuenta de origen."),
    targetAccountId: z.string().uuid("Selecciona la cuenta de destino."),
    amount: z.coerce
      .number()
      .positive("El monto debe ser mayor a cero."),
    transferDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
    notes: z
      .string()
      .trim()
      .max(200, "Las notas no pueden superar 200 caracteres")
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.sourceAccountId === data.targetAccountId) {
      ctx.addIssue({
        code: "custom",
        path: ["targetAccountId"],
        message: "Origen y destino deben ser cuentas distintas.",
      });
    }
  });

export type CashTransferFormInput = z.input<typeof cashTransferSchema>;
export type CashTransferFormValues = z.output<typeof cashTransferSchema>;
