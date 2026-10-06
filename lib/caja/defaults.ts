import type { PaymentDirection } from "@/components/pagos/types";

// Semillas que se insertan perezosamente por dueño la primera vez que se abre
// el módulo de caja. El esquema exige `owner_id` (DEFAULT auth.uid()), por eso
// no se siembran por SQL.
export const DEFAULT_PAYMENT_METHODS = [
  { code: "EFECTIVO", name: "Efectivo" },
  { code: "TRANSFERENCIA_BCP", name: "Transferencia BCP" },
  { code: "TARJETA_CREDITO", name: "Tarjeta de crédito" },
] as const;

export const DEFAULT_CATEGORIES: Record<PaymentDirection, string[]> = {
  INGRESO: ["Cobranza de venta", "Anticipo de cliente", "Otro ingreso"],
  EGRESO: [
    "Pago a proveedor",
    "Anticipo a proveedor",
    "Gasto operativo",
    "Retiro del propietario",
    "Otro egreso",
  ],
};

// Métodos que postean a una caja de efectivo (el resto se asume banco/tarjeta).
export const CASH_METHOD_CODE = "EFECTIVO";
