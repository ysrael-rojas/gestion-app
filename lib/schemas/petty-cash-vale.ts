import { z } from "zod";

// Vale de caja chica: salida de efectivo respaldada con un vale prenumerado.
//
// El serial lo asigna la RPC `create_petty_cash_vale` (correlativo por cuenta),
// así que no forma parte del formulario.
export const pettyCashValeSchema = z.object({
  accountId: z.string().uuid("Selecciona una caja chica."),
  valeDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
  paidTo: z
    .string()
    .trim()
    .min(1, "Indica a quién se pagó el vale.")
    .max(200, "El nombre no puede superar 200 caracteres"),
  concept: z
    .string()
    .trim()
    .min(1, "Indica el concepto del vale.")
    .max(300, "El concepto no puede superar 300 caracteres"),
  amount: z.coerce
    .number()
    .positive("El monto debe ser mayor a cero."),
  hasReceipt: z.boolean().default(false),
});

export type PettyCashValeFormInput = z.input<typeof pettyCashValeSchema>;
export type PettyCashValeFormValues = z.output<typeof pettyCashValeSchema>;

/**
 * Variante con el límite por gasto de la cuenta: un vale que lo supere se
 * rechaza en el cliente con un mensaje claro (la RPC lo vuelve a validar como
 * última línea de defensa).
 */
export function createPettyCashValeSchema(
  expenseLimit: number | null | undefined
) {
  return pettyCashValeSchema.superRefine((data, ctx) => {
    if (expenseLimit !== null && expenseLimit !== undefined && data.amount > expenseLimit) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: `El monto no puede superar el límite por gasto (S/ ${expenseLimit.toFixed(2)}).`,
      });
    }
  });
}

// Reposición del fondo: transfiere el total de los vales elegidos desde otra
// cuenta y los marca como repuestos (RPC `replenish_petty_cash`).
export const pettyCashReplenishSchema = z
  .object({
    accountId: z.string().uuid("Selecciona la caja chica."),
    sourceAccountId: z.string().uuid("Selecciona la cuenta de origen."),
    valeIds: z.array(z.string().uuid()).min(1, "Selecciona al menos un vale."),
  })
  .superRefine((data, ctx) => {
    if (data.sourceAccountId === data.accountId) {
      ctx.addIssue({
        code: "custom",
        path: ["sourceAccountId"],
        message: "El origen debe ser una cuenta distinta de la caja chica.",
      });
    }
  });

export type PettyCashReplenishFormInput = z.input<typeof pettyCashReplenishSchema>;
export type PettyCashReplenishFormValues = z.output<typeof pettyCashReplenishSchema>;
