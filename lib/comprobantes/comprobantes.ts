import type { Sale } from "@/components/ventas/types";
import type { SaleFormValues } from "@/lib/schemas/sale";
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";
import { calculateAmounts } from "@/lib/ventas/amounts";

type ComprobanteRow = Tables<"comprobante">;

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

function mapSaleValues(values: SaleFormValues): ComprobanteMutation {
  const amounts = calculateAmounts(values.total);

  return {
    entity_id: values.entityId,
    voucher_type: values.voucherType,
    voucher_number: values.voucherNumber,
    issue_date: values.issueDate,
    subtotal: amounts.subtotal,
    igv: amounts.igv,
    total: values.total,
    payment_type: values.paymentType,
    credit_days: values.paymentType === "CREDITO" ? values.creditDays ?? null : null,
    status: values.status,
  };
}

function mapSaleRow(row: ComprobanteRow): Sale {
  return {
    id: row.id,
    issueDate: row.issue_date,
    registrationDate: row.registration_date,
    voucherType: row.voucher_type,
    voucherNumber: row.voucher_number,
    entityId: row.entity_id,
    subtotal: row.subtotal,
    igv: row.igv,
    total: row.total,
    paymentType: row.payment_type,
    creditDays: row.credit_days,
    dueDate: row.due_date,
    status: row.status,
  };
}

function mapError(error: { code?: string; message: string }): Error {
  if (error.code === "23503") {
    return new Error("El cliente seleccionado no existe.");
  }

  if (error.code === "23514") {
    return new Error("Los datos del comprobante no son válidos.");
  }

  return new Error(
    "No se pudo completar la operación con la base de datos. Intenta nuevamente."
  );
}

export async function listSales(): Promise<Sale[]> {
  const { data, error } = await supabase
    .from("comprobante")
    .select("*")
    .eq("voucher_kind", "VENTA")
    .is("deleted_at", null)
    .order("issue_date", { ascending: false });

  if (error) {
    throw mapError(error);
  }

  return (data as ComprobanteRow[]).map(mapSaleRow);
}

export async function createSaleRecord(
  values: SaleFormValues
): Promise<Sale> {
  const { data, error } = await supabase
    .from("comprobante")
    .insert({ ...mapSaleValues(values), voucher_kind: "VENTA" })
    .select()
    .single();

  if (error) {
    throw mapError(error);
  }

  return mapSaleRow(data as ComprobanteRow);
}

export async function updateSaleRecord(
  id: string,
  values: SaleFormValues
): Promise<Sale> {
  const { data, error } = await supabase
    .from("comprobante")
    .update(mapSaleValues(values))
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw mapError(error);
  }

  return mapSaleRow(data as ComprobanteRow);
}
