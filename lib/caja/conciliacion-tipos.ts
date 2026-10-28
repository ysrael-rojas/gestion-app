/**
 * Constantes puras de la conciliación bancaria (SPEC 53).
 *
 * Este módulo no importa el cliente de Supabase a propósito: lo usan tanto
 * `lib/caja/conciliacion.ts` (datos) como `lib/schemas/reconciliation.ts`
 * (validación), y los tests de los schemas no deben necesitar credenciales.
 */

import { round2 } from "@/lib/utils";

export const RECONCILIATION_ITEM_KINDS = [
  "DEPOSITO_EN_TRANSITO",
  "PAGO_NO_DEBITADO",
  "CARGO_NO_REGISTRADO",
  "ABONO_NO_REGISTRADO",
] as const;

export type ReconciliationItemKind = (typeof RECONCILIATION_ITEM_KINDS)[number];

/** Signo de cada clase de partida en el formato oficial de conciliación. */
export const ITEM_SIGN: Record<ReconciliationItemKind, 1 | -1> = {
  DEPOSITO_EN_TRANSITO: 1,
  PAGO_NO_DEBITADO: -1,
  CARGO_NO_REGISTRADO: -1,
  ABONO_NO_REGISTRADO: 1,
};

export interface ItemMeta {
  /** Etiqueta corta para listas y chips. */
  label: string;
  /** Etiqueta completa para el formulario y el acta. */
  longLabel: string;
  /** Explicación en lenguaje simple para el dueño del negocio. */
  hint: string;
  /** Signo textual tal como lo escribe el contador. */
  sign: "+" | "−";
}

export const ITEM_META: Record<ReconciliationItemKind, ItemMeta> = {
  DEPOSITO_EN_TRANSITO: {
    label: "En tránsito",
    longLabel: "Depósito en tránsito",
    hint: "Yo registré el ingreso y el banco todavía no lo muestra en el extracto.",
    sign: "+",
  },
  PAGO_NO_DEBITADO: {
    label: "Pagado, no debitado",
    longLabel: "Pago girado y no debitado",
    hint: "Yo registré el pago y el banco todavía no lo descuenta.",
    sign: "−",
  },
  CARGO_NO_REGISTRADO: {
    label: "Cargo no registrado",
    longLabel: "Cargo del banco no registrado",
    hint: "El banco te cobró (ITF, comisión, portes) y todavía no lo registras.",
    sign: "−",
  },
  ABONO_NO_REGISTRADO: {
    label: "Abono no registrado",
    longLabel: "Abono del banco no registrado",
    hint: "El banco te abonó (intereses, devoluciones) y todavía no lo registras.",
    sign: "+",
  },
};

export interface ReconciliationItem {
  id?: string;
  kind: ReconciliationItemKind;
  description: string;
  amount: number;
}

export interface ReconciliationSummary {
  /** Total de cada clase de partida (siempre en positivo). */
  adjustedByKind: Record<ReconciliationItemKind, number>;
  /** Extracto del banco ± partidas. */
  reconciledBalance: number;
  /** Registros propios − saldo conciliado. 0 = conciliado. */
  difference: number;
  isConciled: boolean;
}

function emptyByKind(): Record<ReconciliationItemKind, number> {
  return {
    DEPOSITO_EN_TRANSITO: 0,
    PAGO_NO_DEBITADO: 0,
    CARGO_NO_REGISTRADO: 0,
    ABONO_NO_REGISTRADO: 0,
  };
}

/**
 * Cálculo del formato oficial de conciliación (SPEC 53):
 *
 *   saldo conciliado = saldo del extracto ± partidas
 *   diferencia       = saldo según registros − saldo conciliado
 *
 * Los valores calculados nunca se persisten: se recalculan con las partidas
 * vigentes para que una edición no deje el guardado inconsistente.
 */
export function computeReconciliation(
  statementBalance: number,
  booksBalance: number,
  items: ReconciliationItem[]
): ReconciliationSummary {
  const adjustedByKind = emptyByKind();

  for (const item of items) {
    adjustedByKind[item.kind] = round2(
      adjustedByKind[item.kind] + item.amount
    );
  }

  let reconciled = statementBalance;

  for (const kind of RECONCILIATION_ITEM_KINDS) {
    reconciled += ITEM_SIGN[kind] * adjustedByKind[kind];
  }

  const reconciledBalance = round2(reconciled);
  const difference = round2(booksBalance - reconciledBalance);

  return {
    adjustedByKind,
    reconciledBalance,
    difference,
    // Solo hay conciliación cuando la diferencia es cero (redondeada a 2
    // decimales); un céntimo todavía es una diferencia por explicar.
    isConciled: difference === 0,
  };
}
