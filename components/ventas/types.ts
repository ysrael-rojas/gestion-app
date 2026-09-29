export type VoucherType = "FACTURA" | "BOLETA" | "NOTA_VENTA";
export type PaymentType = "CONTADO" | "CREDITO";
export type SaleStatus = "PAGADO" | "PENDIENTE";

export interface Sale {
  id: string;
  issueDate: string; // "YYYY-MM-DD"
  registrationDate: string; // "YYYY-MM-DD"
  voucherType: VoucherType;
  voucherNumber: string;
  entityId: string; // FK a entidad.id (cliente en la UI de ventas)
  subtotal: number;
  igv: number;
  total: number;
  paymentType: PaymentType;
  creditDays: number | null; // requerido si CREDITO; null si CONTADO
  dueDate: string | null; // calculada: issueDate + creditDays
  status: SaleStatus;
}
