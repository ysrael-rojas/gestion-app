import { z } from "zod";

/**
 * Serie + correlativo del comprobante (SUNAT): hasta 4 caracteres alfanuméricos de
 * serie, un guion y el correlativo numérico. Ejemplo: `F001-000001`.
 * Se valida solo en la app: un CHECK en la base rompería comprobantes históricos.
 */
export const VOUCHER_NUMBER_PATTERN = /^[A-Za-z0-9]{1,4}-\d{1,8}$/;

/**
 * Número de comprobante: recorta espacios y exige el formato serie-correlativo.
 * Compartido por ventas, compras, notas y retenciones.
 */
export const voucherNumberSchema = z
  .string()
  .trim()
  .min(1, "El número de comprobante es requerido")
  .regex(
    VOUCHER_NUMBER_PATTERN,
    "Usa el formato serie-correlativo, por ejemplo F001-000001"
  );
