import type { PaymentType, VoucherType } from "@/components/compras/types";

export type PaymentDirection = "INGRESO" | "EGRESO";
export type PaymentMethod = "EFECTIVO" | "TRANSFERENCIA_BCP" | "TARJETA_CREDITO";
export type PaymentStatus = "REGISTRADO" | "ANULADO";

export interface Payment {
  id: string;
  entityId: string;
  direction: PaymentDirection;
  issueDate: string; // "YYYY-MM-DD" — fecha de emisión del recibo
  paymentDate: string; // "YYYY-MM-DD" — fecha efectiva del pago
  receiptNumber: string; // "RI-000001" | "RE-000001"
  amount: number;
  method: PaymentMethod;
  reference: string | null; // nro de operación BCP / autorización de tarjeta
  status: PaymentStatus;
  voidReason: string | null;
  voidedAt: string | null;
  notes: string | null;
}

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  comprobanteId: string;
  amount: number;
  voucherNumber: string; // "F001-000001"
  voucherType: VoucherType;
}

export interface PaymentHistoryEntry {
  allocationId: string; // payment_allocation.id
  paymentId: string; // payment.id (FK para ReceiptDialog)
  receiptNumber: string; // "RI-000001" | "RE-000001"
  paymentDate: string; // "YYYY-MM-DD" — fecha efectiva del pago
  issueDate: string; // "YYYY-MM-DD" — fecha de emisión del recibo
  direction: PaymentDirection;
  method: PaymentMethod;
  reference: string | null;
  paymentAmount: number; // importe total del pago
  amount: number; // importe aplicado a este comprobante (allocation.amount)
  status: PaymentStatus; // "REGISTRADO" | "ANULADO"
  voidedAt: string | null;
  voidReason: string | null;
  notes: string | null;
}

export interface PaymentDetail extends Payment {
  allocations: PaymentAllocation[];
  assignedAmount: number;
  unassignedAmount: number;
}

export interface AllocationInput {
  comprobanteId: string;
  amount: number;
}

export interface VoucherBalance {
  comprobanteId: string;
  entityId: string;
  voucherKind: "COMPRA" | "VENTA";
  voucherType: VoucherType;
  voucherNumber: string;
  issueDate: string;
  effectiveDueDate: string | null;
  paymentType: PaymentType;
  total: number;
  paidAmount: number;
  balance: number;
}
