export type VoucherType = "FACTURA" | "BOLETA" | "NOTA_VENTA";
export type PaymentType = "CONTADO" | "CREDITO";
export type SaleStatus = "PAGADO" | "PENDIENTE";

export interface Sale {
  id: string; // crypto.randomUUID()
  issueDate: string; // "YYYY-MM-DD" (fecha emisión, editable)
  registrationDate: string; // "YYYY-MM-DD" (fecha actual, automática)
  voucherType: VoucherType;
  voucherNumber: string; // Nro comprobante (manual)
  clientId: string; // referencia a Client del ClientesProvider
  subtotal: number; // calculado: total / 1.18 (2 decimales)
  igv: number; // calculado: total − subtotal (2 decimales)
  total: number; // ingresado por el usuario
  paymentType: PaymentType;
  status: SaleStatus; // nueva venta: PENDIENTE por defecto
}
