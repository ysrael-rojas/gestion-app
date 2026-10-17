import type { VoucherType } from "@/components/ventas/types";
import type { AdjustmentVoucherType } from "@/lib/data/nota-options";

/** Nota de crédito/débito o comprobante de retención (documento de ajuste). */
export interface Nota {
  id: string;
  issueDate: string; // "YYYY-MM-DD"
  registrationDate: string; // "YYYY-MM-DD"
  voucherType: AdjustmentVoucherType;
  voucherNumber: string;
  motiveCode: string | null; // código SUNAT; null en retenciones
  entityId: string; // FK a entidad.id; heredado del comprobante referenciado
  total: number;
  voucherKind: "VENTA" | "COMPRA"; // EMITIDA = VENTA; RECIBIDA = COMPRA
  referencedId: string;
  referencedNumber: string | null; // número del comprobante referenciado
  referencedType: VoucherType | null; // tipo del comprobante referenciado
}

/** Comprobante base (venta o compra) que una nota o retención puede referenciar. */
export interface ReferableComprobante {
  id: string;
  entityId: string;
  voucherKind: "VENTA" | "COMPRA";
  voucherType: VoucherType;
  voucherNumber: string;
  issueDate: string; // "YYYY-MM-DD"
  total: number;
  paidAmount: number;
  balance: number; // saldo efectivo (ya descuenta NC y retenciones)
  creditAmount: number; // suma de NC + retenciones ya aplicadas
  status: "PAGADO" | "PENDIENTE";
}
