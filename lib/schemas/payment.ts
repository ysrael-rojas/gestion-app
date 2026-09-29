import { z } from "zod";

const allocationSchema = z.object({
  comprobanteId: z.string().uuid(),
  amount: z.coerce.number().positive(),
});

export const paymentSchema = z
  .object({
    entityId: z.string().uuid("Selecciona una entidad."),
    direction: z.enum(["INGRESO", "EGRESO"]),
    paymentDate: z.string().min(1, "La fecha de pago es obligatoria."),
    amount: z.coerce.number().positive("El importe debe ser mayor a 0."),
    method: z.enum(["EFECTIVO", "TRANSFERENCIA_BCP", "TARJETA_CREDITO"]),
    reference: z.string().trim().max(60).optional(),
    notes: z.string().trim().max(200).optional(),
    allocations: z.array(allocationSchema).default([]),
  })
  .superRefine((values, ctx) => {
    const assigned = values.allocations.reduce((sum, item) => sum + item.amount, 0);

    if (assigned > values.amount) {
      ctx.addIssue({
        code: "custom",
        message: "Las asignaciones no pueden superar el importe del pago.",
        path: ["allocations"],
      });
    }
  });

export type PaymentFormValues = z.output<typeof paymentSchema>;
export type PaymentFormInput = z.input<typeof paymentSchema>;
