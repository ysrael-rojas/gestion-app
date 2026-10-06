import { z } from "zod";

export const CASH_ACCOUNT_TYPES = ["CASH_BOX", "BANK_ACCOUNT"] as const;
export type CashAccountType = (typeof CASH_ACCOUNT_TYPES)[number];

export const cashAccountTypeSchema = z.enum(CASH_ACCOUNT_TYPES);

const requiredText = (message: string) => z.string().min(1, message);

const optionalText = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.union([z.literal(""), z.string().max(120)]));

export const CLOSING_PERIODICITIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type ClosingPeriodicityValue = (typeof CLOSING_PERIODICITIES)[number];

// "" = "usa la periodicidad predeterminada global" (se guarda como NULL).
const optionalPeriodicity = z
  .union([z.literal(""), z.enum(CLOSING_PERIODICITIES)])
  .transform((value) => (value === "" ? null : value))
  .optional();

const baseCashAccountSchema = z.object({
  name: requiredText("Nombre"),
  currency: z
    .string()
    .trim()
    .min(1, "Moneda requerida")
    .max(8, "Moneda inválida")
    .default("PEN"),
  bankName: optionalText.optional(),
  accountNumber: optionalText.optional(),
  cci: optionalText.optional(),
  closingPeriodicity: optionalPeriodicity,
  openingBalance: z.coerce
    .number()
    .nonnegative("El saldo inicial no puede ser negativo")
    .default(0),
  openingBalanceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)")
    .default(() => new Date().toISOString().slice(0, 10)),
  notes: z.string().max(500, "Las notas no pueden superar 500 caracteres").optional(),
  isActive: z.boolean().default(true),
});

export const cashAccountSchema = baseCashAccountSchema
  .superRefine((data, ctx) => {
    if (data.name.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: "Nombre requerido",
      });
    }
  })
  .transform((data) => ({
    ...data,
    bankName: data.bankName?.trim() || undefined,
    accountNumber: data.accountNumber?.trim() || undefined,
    cci: data.cci?.trim() || undefined,
    notes: data.notes?.trim() || undefined,
  }));

export const cashAccountFormSchema = z
  .object({
    type: cashAccountTypeSchema,
    name: requiredText("Nombre"),
    currency: z
      .string()
      .trim()
      .min(1, "Moneda requerida")
      .default("PEN"),
    bankName: z.string().optional(),
    accountNumber: z.string().optional(),
    cci: z.string().optional(),
    closingPeriodicity: optionalPeriodicity,
    openingBalance: z.coerce
      .number()
      .nonnegative("El saldo inicial no puede ser negativo")
      .default(0),
    openingBalanceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)")
      .default(() => new Date().toISOString().slice(0, 10)),
    notes: z.string().optional(),
    isActive: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (data.name.trim().length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: "Nombre requerido",
      });
    }
    if (data.type === "BANK_ACCOUNT") {
      if (!data.bankName || data.bankName.trim().length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["bankName"],
          message: "El nombre del banco es requerido",
        });
      }
      // accountNumber y cci son opcionales pero, si vienen, se validan
      if (data.accountNumber && !/^[A-Za-z0-9\- ]{4,40}$/.test(data.accountNumber)) {
        ctx.addIssue({
          code: "custom",
          path: ["accountNumber"],
          message: "Número de cuenta inválido",
        });
      }
      if (data.cci && !/^\d{20}$/.test(data.cci)) {
        ctx.addIssue({
          code: "custom",
          path: ["cci"],
          message: "La CCI debe tener 20 dígitos",
        });
      }
    } else if (data.type === "CASH_BOX") {
      // Para cajas no debe haber datos bancarios
      if (data.bankName && data.bankName.trim().length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["bankName"],
          message: "Una caja no tiene banco",
        });
      }
      if (data.accountNumber && data.accountNumber.trim().length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["accountNumber"],
          message: "Una caja no tiene número de cuenta",
        });
      }
      if (data.cci && data.cci.trim().length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["cci"],
          message: "Una caja no tiene CCI",
        });
      }
    }
  })
  .transform((data) => ({
    ...data,
    name: data.name.trim(),
    currency: data.currency.trim().toUpperCase() || "PEN",
    bankName: data.bankName?.trim() || undefined,
    accountNumber: data.accountNumber?.trim() || undefined,
    cci: data.cci?.trim() || undefined,
    notes: data.notes?.trim() || undefined,
  }));

export type CashAccountFormInput = z.input<typeof cashAccountFormSchema>;
export type CashAccountFormValues = z.output<typeof cashAccountFormSchema>;