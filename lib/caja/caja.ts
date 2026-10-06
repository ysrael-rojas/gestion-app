import type {
  CashClose,
  CashReceiptCategory,
  ClosingPeriodicity,
  Payment,
  PaymentDirection,
  PaymentMethodRef,
} from "@/components/pagos/types";
import type { CashCloseFormValues as CashCloseValues } from "@/lib/schemas/cash-close";
import type { CashReceiptCategoryFormValues } from "@/lib/schemas/cash-receipt-category";
import type { PaymentMethodFormValues } from "@/lib/schemas/payment-method";
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENT_METHODS } from "@/lib/caja/defaults";
import { listAccountStatement } from "@/lib/pagos/pagos";
import { addDays, suggestedPeriodEnd } from "@/lib/caja/periodo";
import {
  listCashAccounts,
  type CashAccount,
} from "@/lib/cuentas/entidades";
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

type PaymentMethodRow = Tables<"payment_method">;
type CategoryRow = Tables<"cash_receipt_category">;
type CashCloseRow = Tables<"cash_close">;

export interface CashAccountPosition {
  account: CashAccount;
  balance: number;
}

const DEFAULT_PERIODICITY: ClosingPeriodicity = "DAILY";
const PERIODICITY_SETTING_KEY = "default_closing_periodicity";
const PEN_USD_RATE_SETTING_KEY = "pen_usd_rate";
const DEFAULT_PEN_USD_RATE = "3.75";

function mapError(error: { code?: string; message: string }): Error {
  if (error.code === "P0001") {
    return new Error(error.message);
  }
  if (error.code === "23505") {
    return new Error("Ya existe un registro con esos datos.");
  }
  if (error.code === "23503") {
    return new Error("La cuenta o el registro referenciado no existe.");
  }
  if (error.code === "23514") {
    return new Error("Los datos no cumplen las reglas de validación.");
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

// ---------------------------------------------------------------------------
// Catálogos: métodos de pago y categorías
// ---------------------------------------------------------------------------

function mapPaymentMethodRow(row: PaymentMethodRow): PaymentMethodRef {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isActive: row.is_active,
  };
}

function mapCategoryRow(row: CategoryRow): CashReceiptCategory {
  return {
    id: row.id,
    direction: row.direction,
    name: row.name,
    isActive: row.is_active,
  };
}

export async function listPaymentMethods(
  onlyActive = true
): Promise<PaymentMethodRef[]> {
  let query = supabase.from("payment_method").select("*").order("name");

  if (onlyActive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw mapError(error);
  }

  return (data as PaymentMethodRow[]).map(mapPaymentMethodRow);
}

export async function listCategories(
  direction?: PaymentDirection,
  onlyActive = true
): Promise<CashReceiptCategory[]> {
  let query = supabase.from("cash_receipt_category").select("*").order("name");

  if (direction) {
    query = query.eq("direction", direction);
  }
  if (onlyActive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw mapError(error);
  }

  return (data as CategoryRow[]).map(mapCategoryRow);
}

// Siembra perezosa por dueño: el esquema exige owner_id (DEFAULT auth.uid()),
// así que no se puede sembrar por SQL. Ignora conflictos de unicidad.
export async function ensureCatalogsSeeded(): Promise<void> {
  const [methods, categories] = await Promise.all([
    supabase.from("payment_method").select("id").limit(1),
    supabase.from("cash_receipt_category").select("id").limit(1),
  ]);

  if (methods.error) {
    throw mapError(methods.error);
  }
  if (categories.error) {
    throw mapError(categories.error);
  }

  if ((methods.data ?? []).length === 0) {
    const { error } = await supabase.from("payment_method").insert(
      DEFAULT_PAYMENT_METHODS.map((method) => ({
        code: method.code,
        name: method.name,
      }))
    );
    if (error && error.code !== "23505") {
      throw mapError(error);
    }
  }

  if ((categories.data ?? []).length === 0) {
    const rows = (
      Object.entries(DEFAULT_CATEGORIES) as [PaymentDirection, string[]][]
    ).flatMap(([direction, names]) =>
      names.map((name) => ({ direction, name }))
    );
    const { error } = await supabase
      .from("cash_receipt_category")
      .insert(rows);
    if (error && error.code !== "23505") {
      throw mapError(error);
    }
  }
}

export async function createPaymentMethod(
  values: PaymentMethodFormValues
): Promise<void> {
  const { error } = await supabase.from("payment_method").insert({
    code: values.code,
    name: values.name,
    is_active: values.isActive,
  });

  if (error) {
    throw mapError(error);
  }
}

export async function updatePaymentMethod(
  id: string,
  values: { name?: string; isActive?: boolean }
): Promise<void> {
  const patch: { name?: string; is_active?: boolean } = {};

  if (values.name !== undefined) {
    patch.name = values.name;
  }
  if (values.isActive !== undefined) {
    patch.is_active = values.isActive;
  }

  const { error } = await supabase
    .from("payment_method")
    .update(patch)
    .eq("id", id);

  if (error) {
    throw mapError(error);
  }
}

export async function createCategory(
  values: CashReceiptCategoryFormValues
): Promise<void> {
  const { error } = await supabase.from("cash_receipt_category").insert({
    direction: values.direction,
    name: values.name,
    is_active: values.isActive,
  });

  if (error) {
    throw mapError(error);
  }
}

export async function updateCategory(
  id: string,
  values: { name?: string; isActive?: boolean }
): Promise<void> {
  const patch: { name?: string; is_active?: boolean } = {};

  if (values.name !== undefined) {
    patch.name = values.name;
  }
  if (values.isActive !== undefined) {
    patch.is_active = values.isActive;
  }

  const { error } = await supabase
    .from("cash_receipt_category")
    .update(patch)
    .eq("id", id);

  if (error) {
    throw mapError(error);
  }
}

// ---------------------------------------------------------------------------
// Ajustes generales (app_setting)
// ---------------------------------------------------------------------------

export async function getAppSettings(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("app_setting").select("*");

  if (error) {
    throw mapError(error);
  }

  const settings: Record<string, string> = {};
  for (const row of data ?? []) {
    settings[row.key] = row.value;
  }

  return settings;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase.from("app_setting").upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: "owner_id,key" }
  );

  if (error) {
    throw mapError(error);
  }
}

export async function ensureDefaultSettings(): Promise<void> {
  const settings = await getAppSettings();
  const missing: { key: string; value: string }[] = [];

  if (!settings[PERIODICITY_SETTING_KEY]) {
    missing.push({ key: PERIODICITY_SETTING_KEY, value: DEFAULT_PERIODICITY });
  }
  if (!settings[PEN_USD_RATE_SETTING_KEY]) {
    missing.push({ key: PEN_USD_RATE_SETTING_KEY, value: DEFAULT_PEN_USD_RATE });
  }

  if (missing.length === 0) {
    return;
  }

  const { error } = await supabase.from("app_setting").insert(missing);
  if (error && error.code !== "23505") {
    throw mapError(error);
  }
}

export async function getDefaultPeriodicity(): Promise<ClosingPeriodicity> {
  const settings = await getAppSettings();
  const value = settings[PERIODICITY_SETTING_KEY];

  if (value === "DAILY" || value === "WEEKLY" || value === "MONTHLY") {
    return value;
  }

  return DEFAULT_PERIODICITY;
}

export async function getPenUsdRate(): Promise<number | null> {
  const settings = await getAppSettings();
  const raw = settings[PEN_USD_RATE_SETTING_KEY];

  if (!raw) {
    return null;
  }

  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Posición de efectivo
// ---------------------------------------------------------------------------

export async function getCashPosition(
  accountId: string,
  asOf: string
): Promise<number> {
  const { data, error } = await supabase.rpc("get_cash_position", {
    p_cash_account_id: accountId,
    p_as_of: asOf,
  });

  if (error) {
    throw mapError(error);
  }

  return data ?? 0;
}

export async function listCashPositions(
  asOf: string
): Promise<CashAccountPosition[]> {
  const accounts = await listCashAccounts();

  return Promise.all(
    accounts.map(async (account) => ({
      account,
      balance: await getCashPosition(account.id, asOf),
    }))
  );
}

export async function getCashAccountStatement(
  accountId: string,
  from: string,
  to: string
): Promise<Payment[]> {
  return listAccountStatement(accountId, from, to);
}

// ---------------------------------------------------------------------------
// Cierres de caja
// ---------------------------------------------------------------------------

function mapCashCloseRow(row: CashCloseRow): CashClose {
  return {
    id: row.id,
    cashAccountId: row.cash_account_id,
    periodicity: row.periodicity,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    openingBalance: row.opening_balance,
    incomeTotal: row.income_total,
    expenseTotal: row.expense_total,
    expectedBalance: row.expected_balance,
    countedBalance: row.counted_balance,
    difference: row.difference,
    penUsdRate: row.pen_usd_rate,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export async function getCashClose(id: string): Promise<CashClose> {
  const { data, error } = await supabase
    .from("cash_close")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    throw mapError(error);
  }

  return mapCashCloseRow(data as CashCloseRow);
}

export async function listCashCloses(accountId?: string): Promise<CashClose[]> {
  let query = supabase
    .from("cash_close")
    .select("*")
    .order("period_end", { ascending: false });

  if (accountId) {
    query = query.eq("cash_account_id", accountId);
  }

  const { data, error } = await query;

  if (error) {
    throw mapError(error);
  }

  return (data as CashCloseRow[]).map(mapCashCloseRow);
}

export async function getLastClose(
  accountId: string
): Promise<CashClose | null> {
  const { data, error } = await supabase
    .from("cash_close")
    .select("*")
    .eq("cash_account_id", accountId)
    .order("period_end", { ascending: false })
    .maybeSingle();

  if (error) {
    throw mapError(error);
  }

  return data ? mapCashCloseRow(data as CashCloseRow) : null;
}

export async function getCashAccount(
  accountId: string
): Promise<CashAccount | null> {
  const accounts = await listCashAccounts();
  return accounts.find((account) => account.id === accountId) ?? null;
}

export async function proposeClosePeriod(
  accountId: string,
  today: string
): Promise<{ periodStart: string; periodEnd: string }> {
  const [account, lastClose] = await Promise.all([
    getCashAccount(accountId),
    getLastClose(accountId),
  ]);

  if (!account) {
    throw new Error("La cuenta no existe.");
  }

  const periodicity = account.closingPeriodicity ?? (await getDefaultPeriodicity());
  const periodStart = lastClose
    ? addDays(lastClose.periodEnd, 1)
    : account.openingBalanceDate;
  let periodEnd = suggestedPeriodEnd(periodicity, today);

  if (periodEnd < periodStart) {
    periodEnd = periodStart;
  }

  return { periodStart, periodEnd };
}

export async function closeCashAccount(
  values: CashCloseValues
): Promise<CashClose> {
  const { data, error } = await supabase.rpc("close_cash_account", {
    p_cash_account_id: values.cashAccountId,
    p_period_end: values.periodEnd,
    // La RPC acepta NULL en bancos; el tipo generado no modela la nulabilidad.
    p_counted_balance: (values.countedBalance ?? null) as number,
    p_notes: values.notes || "",
  });

  if (error) {
    throw mapError(error);
  }

  return getCashClose(data as string);
}
