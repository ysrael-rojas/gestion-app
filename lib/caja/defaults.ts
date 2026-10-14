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

export const DEFAULT_CATEGORIES: Record<PaymentDirection, string[]> = {
  INGRESO: ["Cobranza de venta", "Anticipo de cliente", "Otro ingreso"],
  EGRESO: [
    "Pago a proveedor",
    "Anticipo a proveedor",
    "Gasto operativo",
    "Retiro del propietario",
    ...BANK_CHARGE_CATEGORIES,
    "Otro egreso",
  ],
};

// Métodos que postean a una caja de efectivo (el resto se asume banco/tarjeta).
export const CASH_METHOD_CODE = "EFECTIVO";
