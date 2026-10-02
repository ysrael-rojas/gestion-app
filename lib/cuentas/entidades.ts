import type { CashAccountType } from "@/lib/schemas/cash-account";
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

type CashAccountRow = Tables<"cash_account">;

export interface CashAccount {
  id: string;
  type: CashAccountType;
  name: string;
  currency: string;
  bankName: string | null;
  accountNumber: string | null;
  cci: string | null;
  openingBalance: number;
  openingBalanceDate: string;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface CashAccountFormMutation {
  type: CashAccountType;
  name: string;
  currency: string;
  bankName?: string;
  accountNumber?: string;
  cci?: string;
  openingBalance: number;
  openingBalanceDate: string;
  notes?: string;
  isActive: boolean;
}

function mapRow(row: CashAccountRow): CashAccount {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    currency: row.currency,
    bankName: row.bank_name,
    accountNumber: row.account_number,
    cci: row.cci,
    openingBalance: row.opening_balance,
    openingBalanceDate: row.opening_balance_date,
    notes: row.notes,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function mapMutation(values: CashAccountFormMutation) {
  return {
    type: values.type,
    name: values.name,
    currency: values.currency,
    bank_name: values.bankName ?? null,
    account_number: values.accountNumber ?? null,
    cci: values.cci ?? null,
    opening_balance: values.openingBalance,
    opening_balance_date: values.openingBalanceDate,
    notes: values.notes ?? null,
    is_active: values.isActive,
  };
}

function mapError(error: { message?: string }): Error {
  const code = (error as { code?: string }).code;

  if (code === "23505") {
    return new Error("Ya existe una cuenta con esos datos.");
  }
  if (code === "23514") {
    return new Error(
      "Los datos no cumplen las reglas de validación (verifica los campos requeridos)."
    );
  }

  return new Error(
    error.message ?? "No se pudo completar la operación con la base de datos. Intenta nuevamente."
  );
}

export async function listCashAccounts(): Promise<CashAccount[]> {
  const { data, error } = await supabase
    .from("cash_account")
    .select("*")
    .is("deleted_at", null)
    .order("type", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw mapError(error);
  }

  return (data as CashAccountRow[]).map(mapRow);
}

export async function createCashAccount(
  values: CashAccountFormMutation
): Promise<CashAccount> {
  const { data, error } = await supabase
    .from("cash_account")
    .insert(mapMutation(values))
    .select()
    .single();

  if (error) {
    throw mapError(error);
  }

  return mapRow(data as CashAccountRow);
}

export async function updateCashAccount(
  id: string,
  values: CashAccountFormMutation
): Promise<CashAccount> {
  const { data, error } = await supabase
    .from("cash_account")
    .update(mapMutation(values))
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw mapError(error);
  }

  return mapRow(data as CashAccountRow);
}

export async function softDeleteCashAccount(id: string): Promise<void> {
  const { error } = await supabase
    .from("cash_account")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw mapError(error);
  }
}