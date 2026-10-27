import type { CashCountFormValues } from "@/lib/schemas/cash-count";
import { toDenominationPayload } from "@/lib/caja/denominaciones";
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

type CashCountRow = Tables<"cash_count">;

export interface CashCount {
  id: string;
  accountId: string;
  countDate: string;
  countedBalance: number;
  expectedBalance: number;
  difference: number;
  changeFund: number | null;
  countedBy: string | null;
  isSurprise: boolean;
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
    "No se pudo completar la operación con la base de datos. Intenta nuevamente."
  );
}

function mapRow(row: CashCountRow): CashCount {
  return {
    id: row.id,
    accountId: row.cash_account_id,
    countDate: row.count_date,
    countedBalance: row.counted_balance,
    expectedBalance: row.expected_balance,
    difference: row.difference,
    changeFund: row.change_fund,
    countedBy: row.counted_by,
    isSurprise: row.is_surprise,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

/** Arqueos sorpresivos de una cuenta, del más reciente al más antiguo. */
export async function listCashCounts(accountId: string): Promise<CashCount[]> {
  const { data, error } = await supabase
    .from("cash_count")
    .select("*")
    .eq("cash_account_id", accountId)
    .order("count_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw mapError(error);
  }

  return (data as CashCountRow[]).map(mapRow);
}

export async function getCashCount(id: string): Promise<CashCount> {
  const { data, error } = await supabase
    .from("cash_count")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    throw mapError(error);
  }

  return mapRow(data as CashCountRow);
}

/**
 * Registra un arqueo que no cierra período (sorpresivo o intermedio). El saldo
 * esperado lo calcula la RPC con la misma fórmula que el cierre.
 */
export async function createCashCount(
  values: CashCountFormValues
): Promise<CashCount> {
  const denominations = toDenominationPayload(values.denominations);
  const countedBalance =
    denominations.length > 0
      ? denominations.reduce(
          (sum, row) => sum + row.denomination * row.quantity,
          0
        )
      : (values.countedBalance ?? 0);

  const { data, error } = await supabase.rpc("register_cash_count", {
    p_cash_account_id: values.accountId,
    p_count_date: values.countDate,
    p_counted_balance: countedBalance,
    p_denominations: denominations.length > 0 ? denominations : null,
    p_counted_by: values.countedBy || "",
    p_notes: values.notes || "",
  });

  if (error) {
    throw mapError(error);
  }

  return getCashCount(data as string);
}
