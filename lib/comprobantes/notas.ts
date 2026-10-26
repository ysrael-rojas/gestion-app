import type { Nota, ReferableComprobante } from "@/components/notas/types";
import type { AdjustmentVoucherType } from "@/lib/data/nota-options";
import { BASE_VOUCHER_TYPES } from "@/lib/data/sale-options";
import type { NotaFormValues } from "@/lib/schemas/nota";
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";
import { calculateAmounts } from "@/lib/ventas/amounts";

type ComprobanteRow = Tables<"comprobante">;
type VoucherBalanceRow = Tables<"voucher_balance">;

type ReferencedComprobante = Pick<
  ComprobanteRow,
  | "id"
  | "entity_id"
  | "voucher_kind"
  | "voucher_type"
  | "voucher_number"
  | "total"
>;

interface ReferencedInfo {
  voucherNumber: string;
  voucherType: ComprobanteRow["voucher_type"];
}

const CREDIT_VOUCHER_TYPES = ["NOTA_CREDITO", "COMPROBANTE_RETENCION"] as const;

const ADJUSTMENT_VOUCHER_TYPES = [
  "NOTA_CREDITO",
  "NOTA_DEBITO",
  "COMPROBANTE_RETENCION",
] as const;

/** Nota de crédito/débito o retención aplicada a un comprobante base. */
export interface VoucherAdjustment {
  id: string;
  voucherType: AdjustmentVoucherType;
  voucherNumber: string;
  issueDate: string;
  motiveCode: string | null; // null en retenciones
  total: number;
}

const REFERENCED_NOT_FOUND_MESSAGE = "El comprobante referenciado no existe.";
const BASE_VOUCHER_TYPE_MESSAGE =
  "Solo puedes referenciar factura, boleta o nota de venta.";
const CREDIT_TOP_MESSAGE =
  "Las notas de crédito y retenciones no pueden superar el total del comprobante referenciado.";

function mapError(
  error: { code?: string; message: string },
  voucherType?: AdjustmentVoucherType
): Error {
  if (error.code === "P0001") {
    return new Error(error.message);
  }

  if (error.code === "23505") {
    return new Error(
      voucherType === "COMPROBANTE_RETENCION"
        ? "Ya registraste una retención con ese número de comprobante."
        : "Ya registraste una nota con ese número de comprobante."
    );
  }

  if (error.code === "23514") {
    return new Error(
      voucherType === "COMPROBANTE_RETENCION"
        ? "Los datos de la retención no son válidos."
        : "Los datos de la nota no son válidos."
    );
  }

  return new Error(
    "No se pudo completar la operación con la base de datos. Intenta nuevamente."
  );
}

function mapNotaRow(row: ComprobanteRow, referenced?: ReferencedInfo): Nota {
  return {
    id: row.id,
    issueDate: row.issue_date,
    registrationDate: row.registration_date,
    voucherType: row.voucher_type as AdjustmentVoucherType,
    voucherNumber: row.voucher_number,
    motiveCode: row.motive_code,
    entityId: row.entity_id,
    total: row.total,
    voucherKind: row.voucher_kind,
    referencedId: row.referenced_comprobante_id ?? "",
    referencedNumber: referenced?.voucherNumber ?? null,
    referencedType: referenced?.voucherType ?? null,
  };
}

/**
 * Carga el comprobante referenciado y verifica que sea un tipo base del mismo
 * dueño (RLS oculta los de otros usuarios y se comportan como inexistente).
 */
async function fetchReferencedComprobante(
  id: string
): Promise<ReferencedComprobante> {
  const { data, error } = await supabase
    .from("comprobante")
    .select("id, entity_id, voucher_kind, voucher_type, voucher_number, total")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      throw new Error(REFERENCED_NOT_FOUND_MESSAGE);
    }

    throw mapError(error);
  }

  if (!data) {
    throw new Error(REFERENCED_NOT_FOUND_MESSAGE);
  }

  const referenced = data as ReferencedComprobante;

  if (!BASE_VOUCHER_TYPES.includes(referenced.voucher_type)) {
    throw new Error(BASE_VOUCHER_TYPE_MESSAGE);
  }

  return referenced;
}

/**
 * Tope de créditos: la suma de NC y retenciones (dadas de alta) no puede
 * superar el total del comprobante referenciado. Al editar una nota se excluye
 * ella misma del cálculo. Una ND no consume este tope.
 */
async function assertCreditTop(
  referenced: ReferencedComprobante,
  values: NotaFormValues,
  excludeId?: string
): Promise<void> {
  if (values.voucherType === "NOTA_DEBITO") {
    return;
  }

  let query = supabase
    .from("comprobante")
    .select("id, total")
    .eq("referenced_comprobante_id", referenced.id)
    .in("voucher_type", CREDIT_VOUCHER_TYPES)
    .is("deleted_at", null);

  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query;

  if (error) {
    throw mapError(error);
  }

  const appliedCredit = (data ?? []).reduce(
    (sum, row) => sum + (row.total ?? 0),
    0
  );

  if (appliedCredit + values.total > referenced.total) {
    throw new Error(CREDIT_TOP_MESSAGE);
  }
}

/** La retención no tiene desglose de IGV: subtotal = total e igv = 0. */
function resolveAmounts(values: NotaFormValues): {
  subtotal: number;
  igv: number;
} {
  if (values.voucherType === "COMPROBANTE_RETENCION") {
    return { subtotal: values.total, igv: 0 };
  }

  const amounts = calculateAmounts(values.total);
  return { subtotal: amounts.subtotal, igv: amounts.igv };
}

export async function listNotas(
  voucherType: AdjustmentVoucherType
): Promise<Nota[]> {
  const [notasResult, referencedResult] = await Promise.all([
    supabase
      .from("comprobante")
      .select("*")
      .eq("voucher_type", voucherType)
      .is("deleted_at", null)
      .order("issue_date", { ascending: false }),
    supabase
      .from("comprobante")
      .select("id, voucher_number, voucher_type")
      .in("voucher_type", BASE_VOUCHER_TYPES),
  ]);

  if (notasResult.error) {
    throw mapError(notasResult.error);
  }

  if (referencedResult.error) {
    throw mapError(referencedResult.error);
  }

  const referencedMap = new Map<string, ReferencedInfo>(
    (referencedResult.data ?? []).map((row) => [
      row.id,
      { voucherNumber: row.voucher_number, voucherType: row.voucher_type },
    ])
  );

  return (notasResult.data as ComprobanteRow[]).map((row) =>
    mapNotaRow(
      row,
      row.referenced_comprobante_id
        ? referencedMap.get(row.referenced_comprobante_id)
        : undefined
    )
  );
}

/**
 * Ajustes (NC, ND y retenciones) aplicados a un comprobante base. Una sola
 * consulta por `referenced_comprobante_id`; la UI separa notas de retenciones.
 */
export async function listVoucherAdjustments(
  comprobanteId: string
): Promise<VoucherAdjustment[]> {
  const { data, error } = await supabase
    .from("comprobante")
    .select("id, voucher_type, voucher_number, issue_date, motive_code, total")
    .eq("referenced_comprobante_id", comprobanteId)
    .in("voucher_type", ADJUSTMENT_VOUCHER_TYPES)
    .is("deleted_at", null)
    .order("issue_date", { ascending: false })
    .order("voucher_number", { ascending: true });

  if (error) {
    throw mapError(error);
  }

  return ((data ?? []) as ComprobanteRow[]).map((row) => ({
    id: row.id,
    voucherType: row.voucher_type as AdjustmentVoucherType,
    voucherNumber: row.voucher_number,
    issueDate: row.issue_date,
    motiveCode: row.motive_code,
    total: row.total,
  }));
}

export async function listReferableComprobantes(
  voucherKind: "VENTA" | "COMPRA"
): Promise<ReferableComprobante[]> {
  const { data, error } = await supabase
    .from("voucher_balance")
    .select(
      "comprobante_id, entity_id, voucher_kind, voucher_type, voucher_number, issue_date, total, paid_amount, balance, credit_amount, status"
    )
    .eq("voucher_kind", voucherKind)
    .order("issue_date", { ascending: false });

  if (error) {
    throw mapError(error);
  }

  return (data as VoucherBalanceRow[]).map((row) => ({
    id: row.comprobante_id ?? "",
    entityId: row.entity_id ?? "",
    voucherKind: row.voucher_kind ?? voucherKind,
    voucherType: row.voucher_type ?? "FACTURA",
    voucherNumber: row.voucher_number ?? "",
    issueDate: row.issue_date ?? "",
    total: row.total ?? 0,
    paidAmount: row.paid_amount ?? 0,
    balance: row.balance ?? 0,
    creditAmount: row.credit_amount ?? 0,
    status: row.status ?? "PENDIENTE",
  }));
}

export async function createNotaRecord(values: NotaFormValues): Promise<Nota> {
  const referenced = await fetchReferencedComprobante(
    values.referencedComprobanteId
  );
  await assertCreditTop(referenced, values);

  const { subtotal, igv } = resolveAmounts(values);

  const { data, error } = await supabase
    .from("comprobante")
    .insert({
      entity_id: referenced.entity_id,
      voucher_kind: referenced.voucher_kind,
      voucher_type: values.voucherType,
      voucher_number: values.voucherNumber,
      issue_date: values.issueDate,
      subtotal,
      igv,
      total: values.total,
      payment_type: "CONTADO",
      credit_days: null,
      status: "PAGADO",
      referenced_comprobante_id: referenced.id,
      motive_code:
        values.voucherType === "COMPROBANTE_RETENCION"
          ? null
          : values.motiveCode ?? null,
    })
    .select()
    .single();

  if (error) {
    throw mapError(error, values.voucherType);
  }

  return mapNotaRow(data as ComprobanteRow, {
    voucherNumber: referenced.voucher_number,
    voucherType: referenced.voucher_type,
  });
}

export async function updateNotaRecord(
  id: string,
  values: NotaFormValues
): Promise<Nota> {
  const referenced = await fetchReferencedComprobante(
    values.referencedComprobanteId
  );
  await assertCreditTop(referenced, values, id);

  const { subtotal, igv } = resolveAmounts(values);

  const { data, error } = await supabase
    .from("comprobante")
    .update({
      voucher_number: values.voucherNumber,
      issue_date: values.issueDate,
      subtotal,
      igv,
      total: values.total,
      motive_code:
        values.voucherType === "COMPROBANTE_RETENCION"
          ? null
          : values.motiveCode ?? null,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw mapError(error, values.voucherType);
  }

  return mapNotaRow(data as ComprobanteRow, {
    voucherNumber: referenced.voucher_number,
    voucherType: referenced.voucher_type,
  });
}
