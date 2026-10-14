import type { CashTransferFormValues } from "@/lib/schemas/cash-transfer";
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

type CashTransferRow = Tables<"cash_transfer">;

export interface CashTransfer {
  id: string;
  sourceAccountId: string;
  targetAccountId: string;
  amount: number;
  transferDate: string; // "YYYY-MM-DD"
  notes: string | null;
  createdAt: string;
}

function mapError(error: { code?: string; message: string }): Error {
  if (error.code === "P0001") {
    return new Error(error.message);
  }
  if (error.code === "23514") {
    return new Error("Los datos no cumplen las reglas de validación.");
  }
  if (error.code === "23503") {
    return new Error("La cuenta referenciada no existe.");
  }
  if (error.code === "42501") {
    return new Error(
      "No tienes permisos para esta operación. Cierra sesión y vuelve a entrar."
    );
  }
  return new Error(
    "No se pudo completar la transferencia. Intenta nuevamente."
  );
}

function mapRow(row: CashTransferRow): CashTransfer {
  return {
    id: row.id,
    sourceAccountId: row.source_account_id,
    targetAccountId: row.target_account_id,
    amount: row.amount,
    transferDate: row.transfer_date,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function createCashTransfer(
  values: CashTransferFormValues
): Promise<CashTransfer> {
  const { data, error } = await supabase.rpc("create_cash_transfer", {
    p_source_account_id: values.sourceAccountId,
    p_target_account_id: values.targetAccountId,
    p_amount: values.amount,
    p_transfer_date: values.transferDate,
    p_notes: values.notes || "",
  });

  if (error) {
    throw mapError(error);
  }

  return getCashTransfer(data as string);
}

export async function getCashTransfer(id: string): Promise<CashTransfer> {
  const { data, error } = await supabase
    .from("cash_transfer")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    throw mapError(error);
  }

  return mapRow(data as CashTransferRow);
}

// Transferencias del período en las que la cuenta participa (como origen o
// destino), ordenadas por fecha ascendente.
export async function listAccountTransfers(
  accountId: string,
  from: string,
  to: string
): Promise<CashTransfer[]> {
  const { data, error } = await supabase
    .from("cash_transfer")
    .select("*")
    .or(`source_account_id.eq.${accountId},target_account_id.eq.${accountId}`)
    .gte("transfer_date", from)
    .lte("transfer_date", to)
    .order("transfer_date", { ascending: true });

  if (error) {
    throw mapError(error);
  }

  return (data as CashTransferRow[]).map(mapRow);
}
