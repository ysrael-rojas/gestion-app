import type { ReconciliationItem } from "@/lib/caja/conciliacion-tipos";
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

export * from "@/lib/caja/conciliacion-tipos";

type ReconciliationRow = Tables<"bank_reconciliation">;
type ReconciliationItemRow = Tables<"bank_reconciliation_item">;

export interface BankReconciliation {
  id: string;
  accountId: string;
  periodStart: string;
  periodEnd: string;
  statementBalance: number;
  booksBalance: number;
  preparedBy: string | null;
  reviewedBy: string | null;
  notes: string | null;
  updatedAt: string;
  items: ReconciliationItem[];
}

export interface SaveReconciliationInput {
  accountId: string;
  periodStart: string;
  periodEnd: string;
  statementBalance: number;
  booksBalance: number;
  preparedBy?: string | null;
  reviewedBy?: string | null;
  notes?: string | null;
  items: ReconciliationItem[];
}

const LOAD_ERROR =
  "No se pudo cargar la conciliación. Intenta nuevamente.";
const SAVE_ERROR =
  "No se pudo guardar la conciliación. Intenta nuevamente.";

function mapError(
  error: { code?: string; message: string },
  fallback = LOAD_ERROR
): Error {
  if (error.code === "P0001") {
    return new Error(error.message);
  }
  if (error.code === "23505") {
    return new Error("Ya existe una conciliación para ese período.");
  }
  if (error.code === "23503") {
    return new Error("La cuenta bancaria seleccionada no existe.");
  }
  if (error.code === "23514") {
    return new Error("Los datos de la conciliación no son válidos.");
  }
  if (error.code === "42501") {
    return new Error(
      "No tienes permisos para esta operación. Cierra sesión y vuelve a entrar."
    );
  }
  if (error.code === "PGRST116") {
    return new Error("La consulta devolvió más registros de los esperados.");
  }
  return new Error(fallback);
}

function mapItemRow(row: ReconciliationItemRow): ReconciliationItem {
  return {
    id: row.id,
    kind: row.kind,
    description: row.description,
    amount: row.amount,
  };
}

function mapRow(
  row: ReconciliationRow,
  items: ReconciliationItem[]
): BankReconciliation {
  return {
    id: row.id,
    accountId: row.cash_account_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    statementBalance: row.statement_balance,
    booksBalance: row.books_balance,
    preparedBy: row.prepared_by,
    reviewedBy: row.reviewed_by,
    notes: row.notes,
    updatedAt: row.updated_at,
    items,
  };
}

export async function getReconciliation(
  accountId: string,
  periodStart: string,
  periodEnd: string
): Promise<BankReconciliation | null> {
  const { data: header, error } = await supabase
    .from("bank_reconciliation")
    .select("*")
    .eq("cash_account_id", accountId)
    .eq("period_start", periodStart)
    .eq("period_end", periodEnd)
    .maybeSingle();

  if (error) {
    throw mapError(error);
  }

  if (!header) {
    return null;
  }

  const row = header as unknown as ReconciliationRow;

  const { data: items, error: itemsError } = await supabase
    .from("bank_reconciliation_item")
    .select("*")
    .eq("reconciliation_id", row.id)
    .order("created_at", { ascending: true });

  if (itemsError) {
    throw mapError(itemsError);
  }

  return mapRow(
    row,
    ((items ?? []) as unknown as ReconciliationItemRow[]).map(mapItemRow)
  );
}

export async function saveReconciliation(
  input: SaveReconciliationInput
): Promise<BankReconciliation> {
  const { error } = await supabase.rpc("save_bank_reconciliation", {
    p_reconciliation: {
      cash_account_id: input.accountId,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      statement_balance: input.statementBalance,
      books_balance: input.booksBalance,
      prepared_by: input.preparedBy ?? null,
      reviewed_by: input.reviewedBy ?? null,
      notes: input.notes ?? null,
    },
    p_items: input.items.map((item) => ({
      kind: item.kind,
      description: item.description,
      amount: item.amount,
    })),
  });

  if (error) {
    throw mapError(error, SAVE_ERROR);
  }

  const saved = await getReconciliation(
    input.accountId,
    input.periodStart,
    input.periodEnd
  );

  if (!saved) {
    throw new Error(SAVE_ERROR);
  }

  return saved;
}
