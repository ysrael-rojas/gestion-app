"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

import {
  computeReconciliation,
  ITEM_META,
  RECONCILIATION_ITEM_KINDS,
  type ReconciliationItem,
} from "@/lib/caja/conciliacion-tipos";
import { formatCurrency, formatDate, getTodayLocalDate } from "@/lib/utils";

export interface ConciliacionActaData {
  accountName: string;
  bankName: string | null;
  accountNumber: string | null;
  currency: "PEN" | "USD";
  periodStart: string;
  periodEnd: string;
  statementBalance: number;
  booksBalance: number;
  preparedBy: string | null;
  reviewedBy: string | null;
  notes: string | null;
  items: ReconciliationItem[];
}

interface ConciliacionActaProps {
  data: ConciliacionActaData;
  open: boolean;
  onClose: () => void;
}

function Money({
  value,
  currency,
  strong = false,
}: {
  value: number;
  currency: "PEN" | "USD";
  strong?: boolean;
}) {
  return (
    <span className={strong ? "font-semibold tabular-nums" : "tabular-nums"}>
      {formatCurrency(value, currency)}
    </span>
  );
}

/**
 * Acta de conciliación bancaria imprimible (SPEC 53). Mismo patrón que el acta
 * de arqueo: se monta en un portal sobre el body, oculta el resto de la app al
 * imprimir y se desmonta al cerrar el diálogo del navegador. El tamaño A4 se
 * inyecta solo mientras el acta está montada.
 */
export function ConciliacionActa({
  data,
  open,
  onClose,
}: ConciliacionActaProps) {
  const summary = computeReconciliation(
    data.statementBalance,
    data.booksBalance,
    data.items
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const pageStyle = document.createElement("style");
    pageStyle.setAttribute("data-conciliacion-page", "true");
    pageStyle.textContent = "@page { size: A4; margin: 12mm; }";
    document.head.appendChild(pageStyle);

    const handleAfterPrint = () => {
      onClose();
    };

    window.addEventListener("afterprint", handleAfterPrint);
    window.print();

    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);
      pageStyle.remove();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="conciliacion-print-portal bg-white p-2 text-[11px] leading-snug text-black"
      style={{ width: "186mm" }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-black pb-2">
        <div>
          <h1 className="text-[15px] font-bold uppercase">
            Acta de conciliación bancaria
          </h1>
          <p className="mt-1 text-[12px] font-semibold">
            {data.bankName ? `${data.bankName} — ` : ""}
            {data.accountName}
          </p>
          {data.accountNumber ? (
            <p>Cuenta: {data.accountNumber}</p>
          ) : null}
        </div>
        <div className="text-right">
          <p>
            Período: {formatDate(data.periodStart)} —{" "}
            {formatDate(data.periodEnd)}
          </p>
          <p>Moneda: {data.currency}</p>
          <p>Impreso: {formatDate(getTodayLocalDate())}</p>
        </div>
      </div>

      <table className="mt-4 w-full border-collapse">
        <tbody>
          <tr>
            <td className="border border-black p-1">
              Saldo según extracto bancario
            </td>
            <td className="w-40 border border-black p-1 text-right">
              <Money value={data.statementBalance} currency={data.currency} />
            </td>
          </tr>
          {RECONCILIATION_ITEM_KINDS.map((kind) => (
            <tr key={kind}>
              <td className="border border-black p-1">
                ({ITEM_META[kind].sign}) {ITEM_META[kind].longLabel}
              </td>
              <td className="border border-black p-1 text-right">
                <Money
                  value={summary.adjustedByKind[kind]}
                  currency={data.currency}
                />
              </td>
            </tr>
          ))}
          <tr>
            <td className="border border-black p-1 font-semibold">
              Saldo conciliado (extracto ± partidas)
            </td>
            <td className="border border-black p-1 text-right">
              <Money
                value={summary.reconciledBalance}
                currency={data.currency}
                strong
              />
            </td>
          </tr>
          <tr>
            <td className="border border-black p-1 font-semibold">
              Saldo según mis registros
            </td>
            <td className="border border-black p-1 text-right">
              <Money
                value={data.booksBalance}
                currency={data.currency}
                strong
              />
            </td>
          </tr>
          <tr>
            <td className="border border-black p-1 font-semibold">
              Diferencia
            </td>
            <td className="border border-black p-1 text-right">
              <Money
                value={summary.difference}
                currency={data.currency}
                strong
              />
            </td>
          </tr>
        </tbody>
      </table>

      <p className="mt-2 font-semibold">
        Resultado: {summary.isConciled ? "Conciliado" : "Con diferencia"}
      </p>

      {data.items.length > 0 ? (
        <table className="mt-3 w-full border-collapse">
          <thead>
            <tr>
              <th className="w-10 border border-black p-1 text-left">Signo</th>
              <th className="border border-black p-1 text-left">Clase</th>
              <th className="border border-black p-1 text-left">Descripción</th>
              <th className="w-32 border border-black p-1 text-right">Monto</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((item, index) => (
              <tr key={item.id ?? `${item.kind}-${index}`}>
                <td className="border border-black p-1 text-center">
                  {ITEM_META[item.kind].sign}
                </td>
                <td className="border border-black p-1">
                  {ITEM_META[item.kind].label}
                </td>
                <td className="border border-black p-1">{item.description}</td>
                <td className="border border-black p-1 text-right tabular-nums">
                  {formatCurrency(item.amount, data.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {data.notes ? (
        <p className="mt-3">
          <span className="font-semibold">Notas:</span> {data.notes}
        </p>
      ) : null}

      <div className="mt-12 grid grid-cols-2 gap-12">
        <div className="flex flex-col items-center gap-1">
          <div className="h-12 w-full" />
          <div className="w-full border-t border-black pt-1 text-center">
            <p className="font-semibold">Elaborado por</p>
            <p>{data.preparedBy || "\u00a0"}</p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="h-12 w-full" />
          <div className="w-full border-t border-black pt-1 text-center">
            <p className="font-semibold">Revisado por</p>
            <p>{data.reviewedBy || "\u00a0"}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
