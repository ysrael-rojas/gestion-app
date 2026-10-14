import type {
  PettyCashReplenishFormValues,
  PettyCashValeFormValues,
} from "@/lib/schemas/petty-cash-vale";
import { supabase } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";
import { round2 } from "@/lib/utils";

type PettyCashValeRow = Tables<"petty_cash_vale">;

export type ValeStatus = PettyCashValeRow["status"];

export interface PettyCashVale {
  id: string;
  accountId: string;
  /** Correlativo por cuenta, asignado por la RPC (nunca por el cliente). */
  serial: number;
  valeDate: string; // "YYYY-MM-DD"
  paidTo: string;
  concept: string;
  amount: number;
  hasReceipt: boolean;
  status: ValeStatus;
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
  if (error.code === "23505") {
    return new Error("Ya existe un vale con ese número en la cuenta.");
  }
  if (error.code === "42501") {
    return new Error(
      "No tienes permisos para esta operación. Cierra sesión y vuelve a entrar."
    );
  }
  return new Error("No se pudo completar la operación con la base de datos. Intenta nuevamente.");
}

function mapRow(row: PettyCashValeRow): PettyCashVale {
  return {
    id: row.id,
    accountId: row.account_id,
    serial: row.serial,
    valeDate: row.vale_date,
    paidTo: row.paid_to,
    concept: row.concept,
    amount: row.amount,
    hasReceipt: row.has_receipt,
    status: row.status,
    createdAt: row.created_at,
  };
}

/** Vales de una caja chica, ordenados por correlativo. */
export async function listVales(
  accountId: string,
  status?: ValeStatus
): Promise<PettyCashVale[]> {
  let query = supabase
    .from("petty_cash_vale")
    .select("*")
    .eq("account_id", accountId)
    .order("serial", { ascending: true });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;

  if (error) {
    throw mapError(error);
  }

  return (data as PettyCashValeRow[]).map(mapRow);
}

export async function getVale(id: string): Promise<PettyCashVale> {
  const { data, error } = await supabase
    .from("petty_cash_vale")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    throw mapError(error);
  }

  return mapRow(data as PettyCashValeRow);
}

/**
 * Total de vales pendientes: es la parte del fondo que está "en la calle" y
 * que, sumada al efectivo físico, debe cuadrar con el fondo de la caja chica.
 */
export function pendingValesTotal(vales: PettyCashVale[]): number {
  return round2(
    vales
      .filter((vale) => vale.status === "PENDIENTE")
      .reduce((total, vale) => total + vale.amount, 0)
  );
}

export async function createVale(
  values: PettyCashValeFormValues
): Promise<PettyCashVale> {
  const { data, error } = await supabase.rpc("create_petty_cash_vale", {
    p_account_id: values.accountId,
    p_vale_date: values.valeDate,
    p_paid_to: values.paidTo,
    p_concept: values.concept,
    p_amount: values.amount,
    p_has_receipt: values.hasReceipt,
  });

  if (error) {
    throw mapError(error);
  }

  return getVale(data as string);
}

/** Anula un vale pendiente (no se borra: queda el rastro del correlativo). */
export async function anularVale(valeId: string): Promise<void> {
  const { error } = await supabase.rpc("void_petty_cash_vale", {
    p_vale_id: valeId,
  });

  if (error) {
    throw mapError(error);
  }
}

/**
 * Repone el fondo: transfiere el total de los vales elegidos desde otra cuenta
 * y los marca como repuestos en una sola operación (RPC atómica).
 */
export async function replenishPettyCash(
  values: PettyCashReplenishFormValues
): Promise<string> {
  const { data, error } = await supabase.rpc("replenish_petty_cash", {
    p_account_id: values.accountId,
    p_source_account_id: values.sourceAccountId,
    p_vale_ids: values.valeIds,
  });

  if (error) {
    throw mapError(error);
  }

  return data as string;
}
