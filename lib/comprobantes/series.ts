import type { VoucherType } from "@/components/comprobantes/types";
import type { SerieFormValues } from "@/lib/schemas/serie";
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

type VoucherSeriesRow = Tables<"voucher_series">;

export interface VoucherSeries {
  id: string;
  voucherType: VoucherType;
  code: string;
  lastNumber: number;
  isDefault: boolean;
  deletedAt: string | null;
}

/** Mismo formato que `VOUCHER_NUMBER_PATTERN` en `lib/schemas/voucher.ts`. */
const VOUCHER_NUMBER_PARTS = /^([A-Za-z0-9]{1,4})-(\d{1,8})$/;

const CORRELATIVE_PAD = 6;

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function mapRow(row: VoucherSeriesRow): VoucherSeries {
  return {
    id: row.id,
    voucherType: row.voucher_type,
    code: row.code,
    lastNumber: row.last_number,
    isDefault: row.is_default,
    deletedAt: row.deleted_at,
  };
}

function mapError(error: { code?: string; message: string }): Error {
  if (error.code === "23505") {
    return new Error("Ya existe una serie con ese código para ese tipo.");
  }

  if (error.code === "23514") {
    return new Error("Los datos de la serie no son válidos.");
  }

  return new Error(
    "No se pudo completar la operación con la base de datos. Intenta nuevamente."
  );
}

/** Sugerencia editable: `F001-000126` a partir del último correlativo usado. */
export function suggestVoucherNumber(
  series: Pick<VoucherSeries, "code" | "lastNumber">
): string {
  return `${normalizeCode(series.code)}-${String(
    series.lastNumber + 1
  ).padStart(CORRELATIVE_PAD, "0")}`;
}

/** Correlativo de 6 dígitos para mostrar en la tabla de configuración. */
export function formatSeriesCorrelative(lastNumber: number): string {
  return String(lastNumber).padStart(CORRELATIVE_PAD, "0");
}

export async function listSeries(): Promise<VoucherSeries[]> {
  const { data, error } = await supabase
    .from("voucher_series")
    .select("*")
    .is("deleted_at", null)
    .order("voucher_type", { ascending: true })
    .order("code", { ascending: true });

  if (error) {
    throw mapError(error);
  }

  return (data as VoucherSeriesRow[]).map(mapRow);
}

async function clearDefaultSeries(
  voucherType: VoucherType,
  exceptId: string
): Promise<void> {
  const { error } = await supabase
    .from("voucher_series")
    .update({ is_default: false })
    .eq("voucher_type", voucherType)
    .eq("is_default", true)
    .neq("id", exceptId)
    .is("deleted_at", null);

  if (error) {
    throw mapError(error);
  }
}

/**
 * Deja una sola serie por defecto por tipo: el índice único parcial
 * `voucher_series_default_per_type_idx` lo garantiza en la base.
 */
export async function setDefaultSeries(
  id: string,
  voucherType: VoucherType
): Promise<void> {
  await clearDefaultSeries(voucherType, id);

  const { error } = await supabase
    .from("voucher_series")
    .update({ is_default: true })
    .eq("id", id);

  if (error) {
    throw mapError(error);
  }
}

export async function createSeries(
  values: SerieFormValues
): Promise<VoucherSeries> {
  // Primero se guarda sin default: si el insert falla, no se toca el default
  // actual del tipo.
  const { data, error } = await supabase
    .from("voucher_series")
    .insert({
      voucher_type: values.voucherType,
      code: normalizeCode(values.code),
      last_number: 0,
      is_default: false,
    })
    .select()
    .single();

  if (error) {
    throw mapError(error);
  }

  const series = mapRow(data as VoucherSeriesRow);

  if (!values.isDefault) {
    return series;
  }

  await setDefaultSeries(series.id, series.voucherType);

  return { ...series, isDefault: true };
}

export async function updateSeries(
  id: string,
  values: SerieFormValues
): Promise<VoucherSeries> {
  // Se apaga el default antes de reasignarlo, para no chocar con el índice
  // único parcial si la serie cambia de tipo.
  const { data, error } = await supabase
    .from("voucher_series")
    .update({
      voucher_type: values.voucherType,
      code: normalizeCode(values.code),
      is_default: false,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw mapError(error);
  }

  const series = mapRow(data as VoucherSeriesRow);

  if (!values.isDefault) {
    return series;
  }

  await setDefaultSeries(series.id, series.voucherType);

  return { ...series, isDefault: true };
}

/** Baja lógica: la serie deja de aparecer y de sugerir numeración. */
export async function softDeleteSeries(id: string): Promise<void> {
  const { error } = await supabase
    .from("voucher_series")
    .update({
      deleted_at: new Date().toISOString(),
      is_default: false,
    })
    .eq("id", id);

  if (error) {
    throw mapError(error);
  }
}

/**
 * Sube `last_number` al correlativo guardado si es mayor. Si el número usa un
 * prefijo que no corresponde a una serie registrada, no hace nada.
 */
export async function advanceSeriesNumber(
  voucherType: VoucherType,
  voucherNumber: string
): Promise<void> {
  const match = VOUCHER_NUMBER_PARTS.exec(voucherNumber.trim());

  if (!match) {
    return;
  }

  const code = normalizeCode(match[1]);
  const correlative = Number(match[2]);

  if (!Number.isFinite(correlative)) {
    return;
  }

  const { data, error } = await supabase
    .from("voucher_series")
    .select("id, last_number")
    .eq("voucher_type", voucherType)
    .eq("code", code)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw mapError(error);
  }

  if (!data || correlative <= data.last_number) {
    return;
  }

  const { error: updateError } = await supabase
    .from("voucher_series")
    .update({ last_number: correlative })
    .eq("id", data.id)
    .lt("last_number", correlative);

  if (updateError) {
    throw mapError(updateError);
  }
}
