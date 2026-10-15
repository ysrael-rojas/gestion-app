import type { PaymentDirection } from "@/components/pagos/types";

// Semillas que se insertan perezosamente por dueño la primera vez que se abre
// el módulo de caja. El esquema exige `owner_id` (DEFAULT auth.uid()), por eso
// no se siembran por SQL.
export const DEFAULT_PAYMENT_METHODS = [
  { code: "EFECTIVO", name: "Efectivo" },
  { code: "TRANSFERENCIA_BCP", name: "Transferencia BCP" },
  { code: "TARJETA_CREDITO", name: "Tarjeta de crédito" },
] as const;

// Cargos que el banco descuenta de la cuenta (SPEC 33). Se siembran como
// categorías de egreso y son las que ofrece "Registrar cargo bancario".
export const BANK_CHARGE_CATEGORIES = [
  "ITF",
  "Comisión bancaria",
  "Detracción SPOT",
] as const;

// Cada semilla lleva un `code` estable (SPEC 37): el wizard de pagos resuelve
// su categoría por código, así que renombrar el nombre no lo rompe.
export interface SeedCategory {
  code: string;
  name: string;
}

export const DEFAULT_CATEGORIES: Record<PaymentDirection, SeedCategory[]> = {
  INGRESO: [
    { code: "COBRANZA_VENTA", name: "Cobranza de venta" },
    { code: "ANTICIPO_CLIENTE", name: "Anticipo de cliente" },
    { code: "OTRO_INGRESO", name: "Otro ingreso" },
  ],
  EGRESO: [
    { code: "PAGO_PROVEEDOR", name: "Pago a proveedor" },
    { code: "ANTICIPO_PROVEEDOR", name: "Anticipo a proveedor" },
    { code: "GASTO_OPERATIVO", name: "Gasto operativo" },
    { code: "RETIRO_PROPIETARIO", name: "Retiro del propietario" },
    { code: "ITF", name: "ITF" },
    { code: "COMISION_BANCARIA", name: "Comisión bancaria" },
    { code: "DETRACCION_SPOT", name: "Detracción SPOT" },
    { code: "OTRO_EGRESO", name: "Otro egreso" },
  ],
};

// Métodos que postean a una caja de efectivo (el resto se asume banco/tarjeta).
export const CASH_METHOD_CODE = "EFECTIVO";

/**
 * Código para categorías creadas por el usuario: slug del nombre
 * ("Comisión mensual" → "COMISION_MENSUAL"). Devuelve "" si el nombre no
 * tiene letras ni números.
 */
export function categoryCodeFromName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
