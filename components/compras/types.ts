export type VoucherType = "FACTURA" | "BOLETA" | "NOTA_VENTA";
export type PaymentType = "CONTADO" | "CREDITO";
export type PurchaseStatus = "PAGADO" | "PENDIENTE";

export interface Purchase {
  id: string;
  issueDate: string; // "YYYY-MM-DD"
  registrationDate: string; // "YYYY-MM-DD"
  voucherType: VoucherType;
  voucherNumber: string;
  supplierId: string; // FK a entidad.id (proveedor en la UI de compras)
  subtotal: number;
  igv: number;
  total: number;
  paymentType: PaymentType;
  creditDays: number | null; // requerido si CREDITO; null si CONTADO
  dueDate: string | null; // calculada: issueDate + creditDays
  status: PurchaseStatus;
}