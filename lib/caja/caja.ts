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
import {
  categoryCodeFromName,
  DEFAULT_CATEGORIES,
  DEFAULT_PAYMENT_METHODS,
  type SeedCategory,
} from "@/lib/caja/defaults";
import {
  summarizeCashFlow,
  type CashFlowTotals,
} from "@/lib/caja/dashboard";
import {
  sumDenominationCounts,
  toDenominationPayload,
} from "@/lib/caja/denominaciones";
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
type CashCloseDenominationRow = Tables<"cash_close_denomination">;

export interface CashAccountPosition {
  account: CashAccount;
  balance: number;
}

/** Fila del conteo por denominación de un cierre. */
export interface CloseDenomination {
  denomination: number;
  quantity: number;
}

const DEFAULT_PERIODICITY: ClosingPeriodicity = "DAILY";
const PERIODICITY_SETTING_KEY = "default_closing_periodicity";
const PEN_USD_RATE_SETTING_KEY = "pen_usd_rate";
const DEFAULT_PEN_USD_RATE = "3.75";
const DIFFERENCE_TOLERANCE_SETTING_KEY = "cash_difference_tolerance";
const DEFAULT_DIFFERENCE_TOLERANCE = 0.5;

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
  if (error.code === "PGRST116") {
    return new Error(
      "La consulta devolvió más registros de los esperados."
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
    code: row.code ?? "",
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
// así que no se puede sembrar por SQL. Inserta solo las semillas que faltan,
// para que añadir una categoría nueva llegue también a los dueños que ya
// tenían catálogo (SPEC 33). El match es por `code` estable (SPEC 37); las
// categorías antiguas sin code se rescatan con backfill por nombre semilla.
export async function ensureCatalogsSeeded(): Promise<void> {
  const [methods, categories] = await Promise.all([
    supabase.from("payment_method").select("code"),
    supabase.from("cash_receipt_category").select("direction,name,code"),
  ]);

  if (methods.error) {
    throw mapError(methods.error);
  }
  if (categories.error) {
    throw mapError(categories.error);
  }

  const existingCodes = new Set(
    (methods.data ?? []).map((row) => row.code)
  );
  const missingMethods = DEFAULT_PAYMENT_METHODS.filter(
    (method) => !existingCodes.has(method.code)
  );

  if (missingMethods.length > 0) {
    const { error } = await supabase.from("payment_method").insert(
      missingMethods.map((method) => ({
        code: method.code,
        name: method.name,
      }))
    );
    if (error && error.code !== "23505") {
      throw mapError(error);
    }
  }

  const seeds = (
    Object.entries(DEFAULT_CATEGORIES) as [PaymentDirection, SeedCategory[]][]
  ).flatMap(([direction, items]) =>
    items.map((item) => ({ direction, ...item }))
  );
  const seedCodeByKey = new Map(
    seeds.map((seed) => [`${seed.direction}|${seed.name}`, seed.code])
  );
  const rows = (categories.data ?? []) as {
    direction: PaymentDirection;
    name: string;
    code: string | null;
  }[];

  // Backfill: categorías existentes sin code que aún conservan el nombre
  // semilla. Las renombradas por el usuario quedan sin code (aviso aparte).
  for (const row of rows) {
    if (row.code) {
      continue;
    }

    const code = seedCodeByKey.get(`${row.direction}|${row.name}`);

    if (!code) {
      continue;
    }

    const { error } = await supabase
      .from("cash_receipt_category")
      .update({ code })
      .eq("direction", row.direction)
      .eq("name", row.name)
      .is("code", null);

    if (error) {
      throw mapError(error);
    }
  }

  const existingCategoryCodes = new Set(
    rows
      .map((row) => row.code ?? seedCodeByKey.get(`${row.direction}|${row.name}`))
      .filter((code): code is string => Boolean(code))
  );
  const missingCategories = seeds.filter(
    (seed) => !existingCategoryCodes.has(seed.code)
  );

  if (missingCategories.length > 0) {
    const { error } = await supabase
      .from("cash_receipt_category")
      .insert(missingCategories);
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
  // Código estable auto-generado desde el nombre (SPEC 37): el usuario no lo
  // ve, pero permite que el wizard resuelva categorías renombradas.
  const code = categoryCodeFromName(values.name);

  if (!code) {
    throw new Error(
      "El nombre de la categoría debe contener letras o números."
    );
  }

  const { error } = await supabase.from("cash_receipt_category").insert({
    direction: values.direction,
    name: values.name,
    code,
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
  if (!settings[DIFFERENCE_TOLERANCE_SETTING_KEY]) {
    missing.push({
      key: DIFFERENCE_TOLERANCE_SETTING_KEY,
      value: String(DEFAULT_DIFFERENCE_TOLERANCE),
    });
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

/** Tolerancia de redondeo/diferencia permitida al cerrar (SPEC 49). */
export async function getCashDifferenceTolerance(): Promise<number> {
  const settings = await getAppSettings();
  const raw = settings[DIFFERENCE_TOLERANCE_SETTING_KEY];

  if (!raw) {
    return DEFAULT_DIFFERENCE_TOLERANCE;
  }

  const value = Number(raw);
  return Number.isFinite(value) && value >= 0
    ? value
    : DEFAULT_DIFFERENCE_TOLERANCE;
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

/**
 * Saldos de todas las cuentas activas con una sola RPC (`get_cash_positions`),
 * en lugar de una llamada `get_cash_position` por cuenta (N+1).
 */
export async function listCashPositionsConsolidated(
  asOf: string
): Promise<CashAccountPosition[]> {
  const [accounts, { data, error }] = await Promise.all([
    listCashAccounts(),
    supabase.rpc("get_cash_positions", { p_as_of: asOf }),
  ]);

  if (error) {
    throw mapError(error);
  }

  const balances = new Map(
    (data ?? []).map((row) => [row.account_id, Number(row.balance)])
  );

  return accounts
    .filter((account) => account.isActive)
    .map((account) => ({
      account,
      balance: balances.get(account.id) ?? 0,
    }));
}

/**
 * @deprecated Usa `listCashPositionsConsolidated`: resuelve todos los saldos
 * con una sola RPC en lugar de una llamada por cuenta (N+1).
 */
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

/** Ingresos y egresos (sin anulados) de un período, para el resultado del mes. */
export async function getMonthlyCashFlow(
  from: string,
  to: string
): Promise<CashFlowTotals> {
  const { data, error } = await supabase
    .from("payment")
    .select("direction, amount")
    .neq("status", "ANULADO")
    .gte("payment_date", from)
    .lte("payment_date", to);

  if (error) {
    throw mapError(error);
  }

  return summarizeCashFlow(data ?? []);
}

export async function getCashAccountStatement(
  accountId: string,
  from: string,
  to: string
): Promise<Payment[]> {
  return listAccountStatement(accountId, from, to);
}

export async function getLastMovementDate(
  cashAccountId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("payment")
    .select("payment_date")
    .eq("cash_account_id", cashAccountId)
    .order("payment_date", { ascending: false })
    .limit(1);

  if (error) {
    throw mapError(error);
  }

  return data?.[0]?.payment_date ?? null;
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
    changeFund: row.change_fund,
    difference: row.difference,
    differenceReason: row.difference_reason,
    differenceTolerance: row.difference_tolerance,
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
    .limit(1)
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
  const denominations = toDenominationPayload(values.denominations);
  // Con conteo por denominación el total lo manda el detalle (la RPC lo vuelve
  // a sumar); en bancos o cierres sin conteo se usa el saldo contado.
  const countedBalance =
    denominations.length > 0
      ? sumDenominationCounts(denominations)
      : (values.countedBalance ?? null);

  const { data, error } = await supabase.rpc("close_cash_account", {
    p_cash_account_id: values.cashAccountId,
    p_period_end: values.periodEnd,
    // La RPC acepta NULL en bancos; el tipo generado no modela la nulabilidad.
    p_counted_balance: countedBalance as number,
    p_notes: values.notes || "",
    p_denominations: denominations.length > 0 ? denominations : null,
    p_difference_reason: values.differenceReason || "",
  });

  if (error) {
    throw mapError(error);
  }

  return getCashClose(data as string);
}

/** Detalle del conteo por denominación de un cierre (vacío en bancos). */
export async function listCloseDenominations(
  cashCloseId: string
): Promise<CloseDenomination[]> {
  const { data, error } = await supabase
    .from("cash_close_denomination")
    .select("*")
    .eq("cash_close_id", cashCloseId)
    .order("denomination", { ascending: false });

  if (error) {
    throw mapError(error);
  }

  return (data as CashCloseDenominationRow[]).map((row) => ({
    denomination: row.denomination,
    quantity: row.quantity,
  }));
}
