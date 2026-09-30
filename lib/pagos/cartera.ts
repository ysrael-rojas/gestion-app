import type { CarteraBucket, CarteraResumen } from "@/components/cartera/types";
import type {
  Payment,
  PaymentDirection,
  VoucherBalance,
} from "@/components/pagos/types";
import { isOverdue } from "@/lib/pagos/saldos";
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";
import { getTodayLocalDate } from "@/lib/utils";

type PaymentRow = Tables<"payment">;
type PaymentBalanceRow = Tables<"payment_balance">;
type VoucherBalanceRow = Tables<"voucher_balance">;

const LOAD_ERROR =
  "No se pudo cargar el resumen de cartera. Intenta nuevamente.";

function mapPaymentRow(row: PaymentRow): Payment {
  return {
    id: row.id,
    entityId: row.entity_id,
    direction: row.direction,
    issueDate: row.issue_date,
    paymentDate: row.payment_date,
    receiptNumber: row.receipt_number ?? "",
    amount: row.amount,
    method: row.method,
    reference: row.reference,
    status: row.status,
    voidReason: row.void_reason,
    voidedAt: row.voided_at,
    notes: row.notes,
  };
}

function mapVoucherBalanceRow(row: VoucherBalanceRow): VoucherBalance {
  return {
    comprobanteId: row.comprobante_id ?? "",
    entityId: row.entity_id ?? "",
    voucherKind: row.voucher_kind ?? "VENTA",
    voucherType: row.voucher_type ?? "FACTURA",
    voucherNumber: row.voucher_number ?? "",
    issueDate: row.issue_date ?? "",
    effectiveDueDate: row.effective_due_date,
    paymentType: row.payment_type ?? "CONTADO",
    total: row.total ?? 0,
    paidAmount: row.paid_amount ?? 0,
    balance: row.balance ?? 0,
  };
}

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

function emptyBucket(): CarteraBucket {
  return { count: 0, amount: 0, overdueCount: 0, overdueAmount: 0 };
}

function buildVoucherBucket(
  vouchers: VoucherBalance[],
  today: string
): CarteraBucket {
  const bucket = emptyBucket();
  let amount = 0;
  let overdueAmount = 0;

  for (const voucher of vouchers) {
    bucket.count += 1;
    amount += voucher.balance;

    if (isOverdue(voucher.effectiveDueDate, voucher.balance, today)) {
      bucket.overdueCount += 1;
      overdueAmount += voucher.balance;
    }
  }

  bucket.amount = roundAmount(amount);
  bucket.overdueAmount = roundAmount(overdueAmount);

  return bucket;
}

function buildUnassignedBucket(rows: PaymentBalanceRow[]): CarteraBucket {
  const bucket = emptyBucket();
  let amount = 0;

  for (const row of rows) {
    bucket.count += 1;
    amount += row.unassigned_amount ?? 0;
  }

  bucket.amount = roundAmount(amount);

  return bucket;
}

export async function getCarteraResumen(): Promise<CarteraResumen> {
  const today = getTodayLocalDate();

  const [vouchersResult, paymentsResult] = await Promise.all([
    supabase.from("voucher_balance").select("*").gt("balance", 0),
    supabase
      .from("payment_balance")
      .select("*")
      .eq("status", "REGISTRADO")
      .gt("unassigned_amount", 0),
  ]);

  if (vouchersResult.error || paymentsResult.error) {
    throw new Error(LOAD_ERROR);
  }

  const vouchers = (vouchersResult.data as VoucherBalanceRow[]).map(
    mapVoucherBalanceRow
  );
  const unassigned = paymentsResult.data as PaymentBalanceRow[];

  return {
    receivable: buildVoucherBucket(
      vouchers.filter((voucher) => voucher.voucherKind === "VENTA"),
      today
    ),
    payable: buildVoucherBucket(
      vouchers.filter((voucher) => voucher.voucherKind === "COMPRA"),
      today
    ),
    unassignedReceipts: buildUnassignedBucket(
      unassigned.filter((row) => row.direction === "INGRESO")
    ),
    unassignedPayments: buildUnassignedBucket(
      unassigned.filter((row) => row.direction === "EGRESO")
    ),
    today,
  };
}

export async function listOpenVouchers(
  direction: PaymentDirection
): Promise<VoucherBalance[]> {
  const voucherKind = direction === "INGRESO" ? "VENTA" : "COMPRA";

  const { data, error } = await supabase
    .from("voucher_balance")
    .select("*")
    .eq("voucher_kind", voucherKind)
    .gt("balance", 0)
    .order("effective_due_date", { ascending: true });

  if (error) {
    throw new Error(LOAD_ERROR);
  }

  return (data as VoucherBalanceRow[]).map(mapVoucherBalanceRow);
}

export async function listUnassignedPayments(
  direction: PaymentDirection
): Promise<Payment[]> {
  const { data: balanceData, error: balanceError } = await supabase
    .from("payment_balance")
    .select("payment_id")
    .eq("status", "REGISTRADO")
    .eq("direction", direction)
    .gt("unassigned_amount", 0);

  if (balanceError) {
    throw new Error(LOAD_ERROR);
  }

  const paymentIds = (balanceData as Pick<PaymentBalanceRow, "payment_id">[])
    .map((row) => row.payment_id)
    .filter((id): id is string => Boolean(id));

  if (paymentIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("payment")
    .select("*")
    .in("id", paymentIds)
    .order("issue_date", { ascending: false });

  if (error) {
    throw new Error(LOAD_ERROR);
  }

  return (data as PaymentRow[]).map(mapPaymentRow);
}
