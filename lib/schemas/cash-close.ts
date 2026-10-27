import { z } from "zod";

import { isPenDenomination } from "@/lib/caja/denominaciones";
import { getTodayLocalDate } from "@/lib/utils";

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

// Cantidad contada por denominación: "" o ausente -> undefined (no se contó).
const optionalQuantity = z.preprocess(
  (value) =>
    value === "" || value === null || value === undefined
      ? undefined
      : Number(value),
  z
    .number()
    .int("La cantidad debe ser un número entero.")
    .nonnegative("La cantidad no puede ser negativa.")
    .optional()
);

export const closeDenominationSchema = z.object({
  denomination: z.number().refine(isPenDenomination, {
    message: "Denominación fuera del arqueo (S/ 200 a S/ 0.10).",
  }),
  quantity: optionalQuantity,
});

// El detalle del arqueo no puede repetir una denominación (la BD lo bloquea
// con un unique por cierre).
export const cashCloseDenominationsSchema = z
  .array(closeDenominationSchema)
  .superRefine((rows, ctx) => {
    const seen = new Set<number>();

    rows.forEach((row, index) => {
      if (seen.has(row.denomination)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "denomination"],
          message: "Denominación repetida en el arqueo.",
        });
      }
      seen.add(row.denomination);
    });
  });

export const cashCloseSchema = z
  .object({
    cashAccountId: z.string().uuid("Selecciona una cuenta."),
    periodEnd: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
    countedBalance: optionalCountedBalance,
    notes: z.string().trim().max(200).optional(),
    // Motivo escrito cuando la diferencia supera la tolerancia (SPEC 49).
    // La obligatoriedad se valida en el modal (depende del saldo esperado) y
    // la RPC la exige como última línea de defensa.
    differenceReason: z.string().trim().max(300).optional(),
    // Confirmación explícita para cerrar una caja con la grilla en cero (solo UI).
    emptyCashConfirmed: z.boolean().optional(),
    // Solo cajas: conteo por denominación. En bancos no se envía.
    denominations: cashCloseDenominationsSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.periodEnd > getTodayLocalDate()) {
      ctx.addIssue({
        code: "custom",
        path: ["periodEnd"],
        message: "La fecha de cierre no puede ser futura.",
      });
    }
  });

export type CashCloseFormInput = z.input<typeof cashCloseSchema>;
export type CashCloseFormValues = z.output<typeof cashCloseSchema>;
export type CloseDenominationValues = z.output<typeof closeDenominationSchema>;
