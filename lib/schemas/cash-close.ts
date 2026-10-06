import { z } from "zod";

// El conteo físico es opcional (obligatorio solo en cajas, a nivel de UI).
// Cadena vacía o ausente -> undefined; un valor se coacciona a número.
const optionalCountedBalance = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined
      ? undefined
      : Number(value),
  z
    .number()
    .nonnegative("El conteo no puede ser negativo.")
    .optional()
);

export const cashCloseSchema = z.object({
  cashAccountId: z.string().uuid("Selecciona una cuenta."),
  periodEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
  countedBalance: optionalCountedBalance,
  notes: z.string().trim().max(200).optional(),
});

export type CashCloseFormInput = z.input<typeof cashCloseSchema>;
export type CashCloseFormValues = z.output<typeof cashCloseSchema>;
