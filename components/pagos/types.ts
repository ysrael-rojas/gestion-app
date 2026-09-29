import type { PaymentType, VoucherType } from "@/components/compras/types";

export type PaymentDirection = "INGRESO" | "EGRESO";
export type PaymentMethod = "EFECTIVO" | "TRANSFERENCIA_BCP" | "TARJETA_CREDITO";
export type PaymentStatus = "REGISTRADO" | "ANULADO";

export interface Payment {
  id: string;
  entityId: string;
  direction: PaymentDirection;
  issueDate: string; // "YYYY-MM-DD" — define el año del correlativo
  paymentDate: string; // "YYYY-MM-DD" — fecha efectiva del pago
  receiptNumber: string; // "RI-2026-000001" | "RE-2026-000001"
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
