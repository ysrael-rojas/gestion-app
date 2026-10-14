import { z } from "zod";

import { isPenDenomination } from "@/lib/caja/denominaciones";

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

export const cashCloseSchema = z.object({
  cashAccountId: z.string().uuid("Selecciona una cuenta."),
  periodEnd: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
  countedBalance: optionalCountedBalance,
  notes: z.string().trim().max(200).optional(),
  // Solo cajas: conteo por denominación. En bancos no se envía.
  denominations: cashCloseDenominationsSchema.optional(),
});

export type CashCloseFormInput = z.input<typeof cashCloseSchema>;
export type CashCloseFormValues = z.output<typeof cashCloseSchema>;
export type CloseDenominationValues = z.output<typeof closeDenominationSchema>;
