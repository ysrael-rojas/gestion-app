import { z } from "zod";

const allocationSchema = z.object({
  comprobanteId: z.string().uuid(),
  amount: z.coerce.number().positive(),
});

export const paymentSchema = z
  .object({
    entityId: z.string().uuid("Selecciona una entidad.").optional(),
    direction: z.enum(["INGRESO", "EGRESO"]),
    paymentDate: z.string().min(1, "La fecha de pago es obligatoria."),
    amount: z.coerce.number().positive("El importe debe ser mayor a 0."),
    methodId: z.string().uuid("Selecciona un método de pago."),
    cashAccountId: z.string().uuid("Selecciona una caja o banco."),
    categoryId: z.string().uuid("Selecciona una categoría."),
    reference: z.string().trim().max(60).optional(),
    notes: z.string().trim().max(200).optional(),
    allocations: z.array(allocationSchema).default([]),
  })
  .superRefine((values, ctx) => {
    // Un anticipo sin entidad no puede traer asignaciones: la entidad se fija
    // recién al asignar el saldo a una factura (flujo de asignación tardía).
    if (values.allocations.length > 0 && !values.entityId) {
      ctx.addIssue({
        code: "custom",
        message: "Selecciona la entidad para asignar el pago.",
        path: ["entityId"],
      });
    }

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
