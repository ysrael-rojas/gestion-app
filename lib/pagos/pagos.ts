import type {
  AllocationInput,
  Payment,
  PaymentAllocation,
  PaymentDetail,
  PaymentDirection,
  VoucherBalance,
} from "@/components/pagos/types";
import type { PaymentFormValues } from "@/lib/schemas/payment";
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

type PaymentRow = Tables<"payment">;
type AllocationRow = Tables<"payment_allocation">;
type PaymentBalanceRow = Tables<"payment_balance">;
type VoucherBalanceRow = Tables<"voucher_balance">;

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

function mapAllocationRow(
  row: AllocationRow,
  voucher?: VoucherBalanceRow
): PaymentAllocation {
  return {
    id: row.id,
    paymentId: row.payment_id,
    comprobanteId: row.comprobante_id,
    amount: row.amount,
    voucherNumber: voucher?.voucher_number ?? "",
    voucherType: voucher?.voucher_type ?? "FACTURA",
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

function mapError(error: { code?: string; message: string }): Error {
  if (error.code === "P0001") {
    return new Error(error.message);
  }

  if (error.code === "23503") {
    return new Error("La entidad o el comprobante seleccionado no existe.");
  }

  if (error.code === "23505") {
    return new Error("El comprobante ya está asignado a este pago.");
  }

  if (error.code === "23514") {
    return new Error("Los datos del pago no son válidos.");
  }

  if (error.code === "40001") {
    return new Error("Otro proceso está modificando el comprobante. Reintenta.");
  }

  if (error.code === "42883") {
    return new Error("No se pudo crear el pago. Ejecuta la migración de la RPC.");
  }

  return new Error(
    "No se pudo completar la operación con la base de datos. Intenta nuevamente."
  );
}

export async function listPayments(
  direction: PaymentDirection
): Promise<Payment[]> {
  const { data, error } = await supabase
    .from("payment")
    .select("*")
    .eq("direction", direction)
    .order("issue_date", { ascending: false });

  if (error) {
    throw mapError(error);
  }

  return (data as PaymentRow[]).map(mapPaymentRow);
}

export async function listOpenVouchers(
  direction: PaymentDirection,
  entityId: string
): Promise<VoucherBalance[]> {
  const voucherKind = direction === "INGRESO" ? "VENTA" : "COMPRA";

  const { data, error } = await supabase
    .from("voucher_balance")
    .select("*")
    .eq("entity_id", entityId)
    .eq("voucher_kind", voucherKind)
    .gt("balance", 0)
    .order("effective_due_date", { ascending: true });

  if (error) {
    throw mapError(error);
  }

  return (data as VoucherBalanceRow[]).map(mapVoucherBalanceRow);
}

export async function getPaymentDetail(id: string): Promise<PaymentDetail> {
  const { data: paymentData, error: paymentError } = await supabase
    .from("payment")
    .select("*")
    .eq("id", id)
    .single();

  if (paymentError) {
    throw mapError(paymentError);
  }

  const { data: balanceData, error: balanceError } = await supabase
    .from("payment_balance")
    .select("*")
    .eq("payment_id", id)
    .maybeSingle();

  if (balanceError) {
    throw mapError(balanceError);
  }

  const { data: allocationsData, error: allocationsError } = await supabase
    .from("payment_allocation")
    .select("*")
    .eq("payment_id", id);

  if (allocationsError) {
    throw mapError(allocationsError);
  }

  const allocationRows = allocationsData as AllocationRow[];
  const comprobanteIds = allocationRows.map((row) => row.comprobante_id);
  const voucherMap = new Map<string, VoucherBalanceRow>();

  if (comprobanteIds.length > 0) {
    const { data: voucherData, error: voucherError } = await supabase
      .from("voucher_balance")
      .select("*")
      .in("comprobante_id", comprobanteIds);

    if (voucherError) {
      throw mapError(voucherError);
    }

    for (const row of voucherData as VoucherBalanceRow[]) {
      if (row.comprobante_id) {
        voucherMap.set(row.comprobante_id, row);
      }
    }
  }

  const payment = mapPaymentRow(paymentData as PaymentRow);
  const balance = balanceData as PaymentBalanceRow | null;

  return {
    ...payment,
    allocations: allocationRows.map((row) =>
      mapAllocationRow(row, voucherMap.get(row.comprobante_id))
    ),
    assignedAmount: balance?.assigned_amount ?? 0,
    unassignedAmount: balance?.unassigned_amount ?? payment.amount,
  };
}

export async function createPayment(
  values: PaymentFormValues
): Promise<PaymentDetail> {
  const { data, error } = await supabase.rpc(
    "create_payment_with_allocations",
    {
      p_entity_id: values.entityId,
      p_direction: values.direction,
      p_payment_date: values.paymentDate,
      p_amount: values.amount,
      p_method: values.method,
      p_reference: values.reference || "",
      p_notes: values.notes || "",
      p_allocations: values.allocations.map((item) => ({
        comprobante_id: item.comprobanteId,
        amount: item.amount,
      })),
    }
  );

  if (error) {
    throw mapError(error);
  }

  return getPaymentDetail(data as string);
}

export async function addAllocations(
  paymentId: string,
  items: AllocationInput[]
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const { error } = await supabase.from("payment_allocation").insert(
    items.map((item) => ({
      payment_id: paymentId,
      comprobante_id: item.comprobanteId,
      amount: item.amount,
    }))
  );

  if (error) {
    throw mapError(error);
  }
}

export async function voidPayment(id: string, reason: string): Promise<void> {
  const { error } = await supabase
    .from("payment")
    .update({
      status: "ANULADO",
      void_reason: reason,
      voided_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw mapError(error);
  }
}
