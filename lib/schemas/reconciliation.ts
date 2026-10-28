import { z } from "zod";

import { RECONCILIATION_ITEM_KINDS } from "@/lib/caja/conciliacion-tipos";

export const reconciliationItemKindSchema = z.enum(RECONCILIATION_ITEM_KINDS);

/** Monto en positivo: el signo lo aporta la clase de partida. */
const amount = z.coerce
  .number()
  .positive("El monto debe ser mayor a cero.")
  .max(999999999.99, "El monto es demasiado grande.");

export const reconciliationItemSchema = z.object({
  id: z.string().optional(),
  kind: reconciliationItemKindSchema,
  description: z
    .string()
    .trim()
    .min(1, "Escribe una descripción para la partida.")
    .max(200, "La descripción no puede superar 200 caracteres."),
  amount,
});

export const reconciliationFormSchema = z.object({
  statementBalance: z.coerce
    .number()
    .nonnegative("El saldo según extracto no puede ser negativo."),
  preparedBy: z
    .string()
    .trim()
    .max(100, "El nombre no puede superar 100 caracteres.")
    .optional(),
  reviewedBy: z
    .string()
    .trim()
    .max(100, "El nombre no puede superar 100 caracteres.")
    .optional(),
  notes: z
    .string()
    .trim()
    .max(500, "Las notas no pueden superar 500 caracteres.")
    .optional(),
  items: z.array(reconciliationItemSchema).default([]),
});

export type ReconciliationItemInput = z.input<typeof reconciliationItemSchema>;
export type ReconciliationItemValues = z.output<typeof reconciliationItemSchema>;
export type ReconciliationFormInput = z.input<typeof reconciliationFormSchema>;
export type ReconciliationFormValues = z.output<typeof reconciliationFormSchema>;
