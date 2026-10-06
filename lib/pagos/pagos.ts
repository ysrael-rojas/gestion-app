import type {
  AllocationInput,
  Payment,
  PaymentAllocation,
  PaymentDetail,
  PaymentDirection,
  PaymentHistoryEntry,
  VoucherBalance,
} from "@/components/pagos/types";
import type { PaymentFormValues } from "@/lib/schemas/payment";
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

type PaymentRow = Tables<"payment">;
type AllocationRow = Tables<"payment_allocation">;
type PaymentBalanceRow = Tables<"payment_balance">;
type VoucherBalanceRow = Tables<"voucher_balance">;

type PaymentRefs = {
  payment_method: { name: string } | null;
  cash_account: { name: string } | null;
  cash_receipt_category: { name: string } | null;
};

type PaymentRowWithRefs = PaymentRow & PaymentRefs;

const PAYMENT_SELECT =
  "*, payment_method(name), cash_account(name), cash_receipt_category(name)";

type PaymentHistoryRow = {
  allocation_id: string;
  id: string;
  receipt_number: string | null;
  payment_date: string;
  issue_date: string;
  direction: PaymentRow["direction"];
  method_name: string;
  cash_account_name: string;
  category_name: string;
  reference: string | null;
  payment_amount: number;
  status: PaymentRow["status"];
  voided_at: string | null;
  void_reason: string | null;
  notes: string | null;
  allocation_amount: number;
  receipt_serial: number;
};

function mapPaymentRow(row: PaymentRowWithRefs): Payment {
  return {
    id: row.id,
    entityId: row.entity_id,
    direction: row.direction,
    issueDate: row.issue_date,
    paymentDate: row.payment_date,
    receiptNumber: row.receipt_number ?? "",
    amount: row.amount,
    methodId: row.method_id,
    methodName: row.payment_method?.name ?? "",
    cashAccountId: row.cash_account_id,
    cashAccountName: row.cash_account?.name ?? "",
    categoryId: row.category_id,
    categoryName: row.cash_receipt_category?.name ?? "",
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

function mapPaymentHistoryRow(row: PaymentHistoryRow): PaymentHistoryEntry {
  return {
    allocationId: row.allocation_id,
    paymentId: row.id,
    receiptNumber: row.receipt_number ?? "",
    paymentDate: row.payment_date,
    issueDate: row.issue_date,
    direction: row.direction,
    methodName: row.method_name,
    cashAccountName: row.cash_account_name,
    categoryName: row.category_name,
    reference: row.reference,
    paymentAmount: row.payment_amount,
    amount: row.allocation_amount,
    status: row.status,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
    notes: row.notes,
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

  if (error.code === "42703") {
    return new Error(
      "Error interno: el esquema de la base de datos está desactualizado. Avisa al administrador."
    );
  }

  if (error.code === "42501") {
    return new Error(
      "No tienes permisos para esta operación. Cierra sesión y vuelve a entrar."
    );
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
    .select(PAYMENT_SELECT)
    .eq("direction", direction)
    .order("issue_date", { ascending: false });

  if (error) {
    throw mapError(error);
  }

  return (data as unknown as PaymentRowWithRefs[]).map(mapPaymentRow);
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
    .select(PAYMENT_SELECT)
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

  const payment = mapPaymentRow(paymentData as unknown as PaymentRowWithRefs);
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

export async function getPaymentHistory(
  comprobanteId: string
): Promise<PaymentHistoryEntry[]> {
  const { data: allocationsData, error: allocationsError } = await supabase
    .from("payment_allocation")
    .select("*")
    .eq("comprobante_id", comprobanteId);

  if (allocationsError) {
    throw mapError(allocationsError);
  }

  const allocationRows = allocationsData as AllocationRow[];

  if (allocationRows.length === 0) {
    return [];
  }

  const paymentIds = [...new Set(allocationRows.map((row) => row.payment_id))];

  const { data: paymentsData, error: paymentsError } = await supabase
    .from("payment")
    .select(PAYMENT_SELECT)
    .in("id", paymentIds);

  if (paymentsError) {
    throw mapError(paymentsError);
  }

  const paymentMap = new Map<string, PaymentRowWithRefs>();

  for (const row of paymentsData as unknown as PaymentRowWithRefs[]) {
    paymentMap.set(row.id, row);
  }

  const historyRows: PaymentHistoryRow[] = [];

  for (const allocation of allocationRows) {
    const payment = paymentMap.get(allocation.payment_id);

    if (!payment) {
      continue;
    }

    historyRows.push({
      allocation_id: allocation.id,
      id: payment.id,
      receipt_number: payment.receipt_number,
      payment_date: payment.payment_date,
      issue_date: payment.issue_date,
      direction: payment.direction,
      method_name: payment.payment_method?.name ?? "",
      cash_account_name: payment.cash_account?.name ?? "",
      category_name: payment.cash_receipt_category?.name ?? "",
      reference: payment.reference,
      payment_amount: payment.amount,
      status: payment.status,
      voided_at: payment.voided_at,
      void_reason: payment.void_reason,
      notes: payment.notes,
      allocation_amount: allocation.amount,
      receipt_serial: payment.receipt_serial,
    });
  }

  historyRows.sort((a, b) => {
    if (a.issue_date !== b.issue_date) {
      return a.issue_date < b.issue_date ? 1 : -1;
    }

    return b.receipt_serial - a.receipt_serial;
  });

  return historyRows.map(mapPaymentHistoryRow);
}

export async function createPayment(
  values: PaymentFormValues
): Promise<PaymentDetail> {
  const { data, error } = await supabase.rpc(
    "create_payment_with_allocations",
    {
      // El RPC acepta entity_id NULL (anticipo sin entidad). El tipo generado
      // declara `string` porque no modela la nulabilidad de los parámetros.
      p_entity_id: (values.entityId ?? null) as string,
      p_direction: values.direction,
      p_payment_date: values.paymentDate,
      p_amount: values.amount,
      p_method_id: values.methodId,
      p_cash_account_id: values.cashAccountId,
      p_category_id: values.categoryId,
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
  items: AllocationInput[],
  entityId?: string
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  // Un pago sin entidad (anticipo genérico) se liga a la entidad elegida al
  // asignarle facturas. El update es un no-op si el pago ya tiene entidad.
  if (entityId) {
    const { error: entityError } = await supabase
      .from("payment")
      .update({ entity_id: entityId })
      .eq("id", paymentId)
      .is("entity_id", null);

    if (entityError) {
      throw mapError(entityError);
    }
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
