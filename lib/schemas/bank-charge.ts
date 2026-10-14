import { z } from "zod";

// Cargo que el banco descuenta de la cuenta (ITF, comisión, detracción SPOT).
// Se registra como un recibo de egreso con la categoría de cargo elegida, sin
// entidad: no es el pago de una factura.
export const bankChargeSchema = z.object({
  cashAccountId: z.string().uuid("Selecciona una cuenta."),
  categoryId: z.string().uuid("Selecciona el tipo de cargo."),
  methodId: z.string().uuid("Selecciona el método de pago."),
  amount: z.coerce.number().positive("El importe debe ser mayor a cero."),
  chargeDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
  reference: z
    .string()
    .trim()
    .max(60, "La referencia no puede superar 60 caracteres")
    .optional(),
  notes: z
    .string()
    .trim()
    .max(200, "Las notas no pueden superar 200 caracteres")
    .optional(),
});

export type BankChargeFormInput = z.input<typeof bankChargeSchema>;
export type BankChargeFormValues = z.output<typeof bankChargeSchema>;
