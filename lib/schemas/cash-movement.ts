import { z } from "zod";

import { getTodayLocalDate } from "@/lib/utils";

// Movimiento de caja (SPEC 50): entra o sale dinero sin cobrar ni pagar un
// comprobante. El método es obligatorio porque la RPC de creación lo exige;
// en cajas solo hay EFECTIVO y en bancos los demás.
export const cashMovementSchema = z
  .object({
    cashAccountId: z.string().uuid("Selecciona una cuenta."),
    direction: z.enum(["INGRESO", "EGRESO"]),
    methodId: z.string().uuid("Selecciona el método."),
    categoryId: z.string().uuid("Selecciona la categoría."),
    amount: z.coerce.number().positive("El importe debe ser mayor a 0."),
    movementDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
    reference: z.string().trim().max(60).optional(),
    notes: z.string().trim().max(200).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.movementDate > getTodayLocalDate()) {
      ctx.addIssue({
        code: "custom",
        path: ["movementDate"],
        message: "La fecha del movimiento no puede ser futura.",
      });
    }
  });

export type CashMovementFormInput = z.input<typeof cashMovementSchema>;
export type CashMovementFormValues = z.output<typeof cashMovementSchema>;
