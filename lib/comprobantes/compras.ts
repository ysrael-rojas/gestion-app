import type { Purchase } from "@/components/compras/types";
import type { PurchaseFormValues } from "@/lib/schemas/purchase";
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";
import { calculateAmounts } from "@/lib/ventas/amounts";

type ComprobanteRow = Tables<"comprobante">;

interface VoucherBalance {
  paidAmount: number;
  balance: number;
}

type ComprobanteMutation = Pick<
  ComprobanteRow,
  | "entity_id"
  | "voucher_type"
  | "voucher_number"
  | "issue_date"
  | "subtotal"
  | "igv"
  | "total"
  | "payment_type"
  | "credit_days"
  | "status"
>;

function mapPurchaseValues(values: PurchaseFormValues): ComprobanteMutation {
  const amounts = calculateAmounts(values.total);

  return {
    entity_id: values.supplierId,
    voucher_type: values.voucherType,
    voucher_number: values.voucherNumber,
    issue_date: values.issueDate,
    subtotal: amounts.subtotal,
    igv: amounts.igv,
    total: values.total,
    payment_type: values.paymentType,
    credit_days:
      values.paymentType === "CREDITO" ? values.creditDays ?? null : null,
    status: values.status,
  };
}

function mapPurchaseRow(
  row: ComprobanteRow,
  balanceMap?: Map<string, VoucherBalance>
): Purchase {
  const balance = balanceMap?.get(row.id);

  return {
    id: row.id,
    issueDate: row.issue_date,
    registrationDate: row.registration_date,
    voucherType: row.voucher_type,
    voucherNumber: row.voucher_number,
    supplierId: row.entity_id,
    subtotal: row.subtotal,
    igv: row.igv,
    total: row.total,
    paymentType: row.payment_type,
    creditDays: row.credit_days,
    dueDate: row.due_date,
    status: row.status,
    paidAmount: balance?.paidAmount ?? 0,
    balance: balance?.balance ?? row.total,
  };
}

function mapError(error: { code?: string; message: string }): Error {
  if (error.code === "23503") {
    return new Error("El proveedor seleccionado no existe.");
  }

  if (error.code === "23514") {
    return new Error("Los datos del comprobante no son válidos.");
  }

  return new Error(
    "No se pudo completar la operación con la base de datos. Intenta nuevamente."
  );
}

export async function listPurchases(): Promise<Purchase[]> {
  const [purchasesResult, balancesResult] = await Promise.all([
    supabase
      .from("comprobante")
      .select("*")
      .eq("voucher_kind", "COMPRA")
      .is("deleted_at", null)
      .order("issue_date", { ascending: false }),
    supabase
      .from("voucher_balance")
      .select("comprobante_id, paid_amount, balance")
      .eq("voucher_kind", "COMPRA"),
  ]);

  if (purchasesResult.error) {
    throw mapError(purchasesResult.error);
  }

  const balanceMap = new Map<string, VoucherBalance>();

  if (balancesResult.error) {
    console.error(
      "No se pudo cargar el saldo de las compras:",
      balancesResult.error
    );
  } else {
    for (const row of balancesResult.data ?? []) {
      if (row.comprobante_id) {
        balanceMap.set(row.comprobante_id, {
          paidAmount: row.paid_amount ?? 0,
          balance: row.balance ?? 0,
        });
      }
    }
  }

  return (purchasesResult.data as ComprobanteRow[]).map((row) =>
    mapPurchaseRow(row, balanceMap)
  );
}

export async function createPurchaseRecord(
  values: PurchaseFormValues
): Promise<Purchase> {
  const { data, error } = await supabase
    .from("comprobante")
    .insert({ ...mapPurchaseValues(values), voucher_kind: "COMPRA" })
    .select()
    .single();

  if (error) {
    throw mapError(error);
  }

  return mapPurchaseRow(data as ComprobanteRow);
}

export async function updatePurchaseRecord(
  id: string,
  values: PurchaseFormValues
): Promise<Purchase> {
  const { data, error } = await supabase
    .from("comprobante")
    .update(mapPurchaseValues(values))
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw mapError(error);
  }

  return mapPurchaseRow(data as ComprobanteRow);
}