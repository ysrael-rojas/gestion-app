export type VoucherKind = "VENTA" | "COMPRA";

export type VoucherType =
  | "FACTURA"
  | "BOLETA"
  | "NOTA_VENTA"
  | "NOTA_CREDITO"
  | "NOTA_DEBITO"
  | "COMPROBANTE_RETENCION";

export type PaymentType = "CONTADO" | "CREDITO";
export type VoucherStatus = "PAGADO" | "PENDIENTE";

/**
 * Comprobante base unificado para las páginas de ventas y compras.
 * `entityId` apunta al cliente (VENTA) o al proveedor (COMPRA).
 */
export interface Voucher {
  id: string;
  issueDate: string; // "YYYY-MM-DD"
  registrationDate: string; // "YYYY-MM-DD"
  voucherType: VoucherType;
  voucherNumber: string;
  entityId: string;
  subtotal: number;
  igv: number;
  total: number;
  paymentType: PaymentType;
  creditDays: number | null;
  dueDate: string | null;
  status: VoucherStatus;
  paidAmount: number;
  balance: number;
}
