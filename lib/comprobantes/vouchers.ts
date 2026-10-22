import type { Voucher } from "@/components/comprobantes/types";
import { BASE_VOUCHER_TYPES } from "@/lib/data/sale-options";
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

type ComprobanteRow = Tables<"comprobante">;

export type VoucherKind = "VENTA" | "COMPRA";

/**
 * Carga un comprobante individual (tipo base, no dado de baja) con su saldo
 * desde la vista `voucher_balance`. Devuelve null cuando no existe, está
 * anulado o pertenece a otro tipo (RLS también lo oculta).
 */
export async function getVoucherById(
  id: string,
  kind: VoucherKind
): Promise<Voucher | null> {
  const [voucherResult, balanceResult] = await Promise.all([
    supabase
      .from("comprobante")
      .select("*")
      .eq("id", id)
      .eq("voucher_kind", kind)
      .in("voucher_type", BASE_VOUCHER_TYPES)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("voucher_balance")
      .select("comprobante_id, paid_amount, balance")
      .eq("comprobante_id", id)
      .maybeSingle(),
  ]);

  if (voucherResult.error) {
    if (voucherResult.error.code === "PGRST116") {
      return null;
    }

    throw new Error(
      "No se pudo cargar el comprobante. Intenta nuevamente."
    );
  }

  if (!voucherResult.data) {
    return null;
  }

  if (balanceResult.error) {
    throw new Error(
      "No se pudo cargar el saldo del comprobante. Intenta nuevamente."
    );
  }

  const row = voucherResult.data as ComprobanteRow;
  const balance = balanceResult.data;

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
    paidAmount: balance?.paid_amount ?? 0,
    balance: balance?.balance ?? row.total,
  };
}
