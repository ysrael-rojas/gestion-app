import type { SelectOption } from "@/lib/data/sale-options";

/** Tipos de comprobante que ajustan a otro (no son cobrables ni pagables). */
export type AdjustmentVoucherType =
  | "NOTA_CREDITO"
  | "NOTA_DEBITO"
  | "COMPROBANTE_RETENCION";

/** Tipos de nota con motivo del catálogo SUNAT. */
export type NoteVoucherType = Extract<
  AdjustmentVoucherType,
  "NOTA_CREDITO" | "NOTA_DEBITO"
>;

/** Una nota/retención se emite (venta) o se recibe de un proveedor (compra). */
export type NotaRelation = "EMITIDA" | "RECIBIDA";

/**
 * Motivos de nota de crédito (catálogo SUNAT, códigos 01–07, 09 y 10).
 * Una NC disminuye el importe del comprobante referenciado.
 */
export const CREDIT_NOTE_MOTIVES: SelectOption<string>[] = [
  { value: "01", label: "Anulación de la operación" },
  { value: "02", label: "Anulación por error en el RUC" },
  { value: "03", label: "Corrección por error en la descripción" },
  { value: "04", label: "Descuento global" },
  { value: "05", label: "Descuento por ítem" },
  { value: "06", label: "Devolución total" },
  { value: "07", label: "Devolución por ítem" },
  { value: "09", label: "Disminución en el valor" },
  { value: "10", label: "Otros conceptos" },
];

/**
 * Motivos de nota de débito (catálogo SUNAT, códigos 01–03).
 * Una ND aumenta el importe del comprobante referenciado.
 */
export const DEBIT_NOTE_MOTIVES: SelectOption<string>[] = [
  { value: "01", label: "Intereses por mora" },
  { value: "02", label: "Aumento en el valor" },
  { value: "03", label: "Penalidades / otros conceptos" },
];

/** Motivos disponibles según el tipo de nota. */
export const NOTE_MOTIVES: Record<NoteVoucherType, SelectOption<string>[]> = {
  NOTA_CREDITO: CREDIT_NOTE_MOTIVES,
  NOTA_DEBITO: DEBIT_NOTE_MOTIVES,
};

/** Etiquetas de los tres tipos de ajuste. */
export const ADJUSTMENT_VOUCHER_TYPES: SelectOption<AdjustmentVoucherType>[] =
  [
    { value: "NOTA_CREDITO", label: "Nota de crédito" },
    { value: "NOTA_DEBITO", label: "Nota de débito" },
    { value: "COMPROBANTE_RETENCION", label: "Comprobante de retención" },
  ];

export const NOTA_RELATIONS: SelectOption<NotaRelation>[] = [
  { value: "EMITIDA", label: "Emitida" },
  { value: "RECIBIDA", label: "Recibida" },
];

/** La retención solo se recibe: la emite el agente de retención (el cliente). */
export const RETENCION_RELATIONS: SelectOption<NotaRelation>[] = [
  { value: "RECIBIDA", label: "Recibida" },
];
