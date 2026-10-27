import type { PaymentType, VoucherType } from "@/components/compras/types";
import type { Currency } from "@/lib/utils";

export type PaymentDirection = "INGRESO" | "EGRESO";
export type PaymentStatus = "EN_REVISION" | "PROCESADO" | "ANULADO";
export type ClosingPeriodicity = "DAILY" | "WEEKLY" | "MONTHLY";

export interface PaymentMethodRef {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface CashReceiptCategory {
  id: string;
  direction: PaymentDirection;
  name: string;
  code: string; // código estable para resolver la categoría (SPEC 37)
  isActive: boolean;
}

export interface Payment {
  id: string;
  entityId: string | null; // null = anticipo sin entidad asignada aún
  direction: PaymentDirection;
  paymentDate: string; // "YYYY-MM-DD" — única fecha del recibo (emisión = pago)
  receiptNumber: string; // "RI-000001" | "RE-000001"
  amount: number;
  currency: Currency; // moneda de la cuenta de caja del pago (join, no columna)
  methodId: string;
  methodName: string;
  cashAccountId: string;
  cashAccountName: string;
  categoryId: string;
  categoryName: string;
  reference: string | null; // nro de operación BCP / autorización de tarjeta
  status: PaymentStatus;
  voidReason: string | null;
  voidedAt: string | null;
  notes: string | null;
  /** true = movimiento de caja/cargo/vale: no se asigna a comprobantes (SPEC 50). */
  isCashMovement: boolean;
}

/** Fila del listado de pagos: añade el saldo aún no asignado (SPEC 48). */
export interface PaymentListItem extends Payment {
  unassignedAmount: number;
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
  paymentDate: string; // "YYYY-MM-DD" — única fecha del recibo
  direction: PaymentDirection;
  methodName: string;
  cashAccountName: string;
  categoryName: string;
  reference: string | null;
  paymentAmount: number; // importe total del pago
  amount: number; // importe aplicado a este comprobante (allocation.amount)
  status: PaymentStatus; // "EN_REVISION" | "PROCESADO" | "ANULADO"
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

export interface CashClose {
  id: string;
  cashAccountId: string;
  periodicity: ClosingPeriodicity;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  incomeTotal: number;
  expenseTotal: number;
  expectedBalance: number;
  countedBalance: number | null;
  /** Fondo de cambio congelado al cerrar (null en cierres históricos). */
  changeFund: number | null;
  difference: number | null;
  /** Motivo escrito cuando la diferencia supera la tolerancia (SPEC 49). */
  differenceReason: string | null;
  /** Tolerancia vigente al cerrar (snapshot; null en cierres históricos). */
  differenceTolerance: number | null;
  /** Quién contó la caja (SPEC 51; null en cierres históricos). */
  countedBy: string | null;
  /** Quién revisó el arqueo (SPEC 51; null en cierres históricos). */
  verifiedBy: string | null;
  penUsdRate: number | null;
  notes: string | null;
  createdAt: string;
}
