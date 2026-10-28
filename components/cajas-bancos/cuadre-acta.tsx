"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

import type { Payment, CashClose } from "@/components/pagos/types";
import { getPeriodicityLabel } from "@/lib/data/cash-options";
import {
  denominationKind,
  formatDenomination,
  netCash,
  sumDenominationCounts,
} from "@/lib/caja/denominaciones";
import type { CloseDenomination } from "@/lib/caja/caja";
import {
  formatReceiptRanges,
  summarizeReceiptSequence,
} from "@/lib/caja/reportes";
import type { CashAccountType } from "@/lib/schemas/cash-account";
import { formatCurrency, formatDate, getTodayLocalDate } from "@/lib/utils";

interface CuadreActaProps {
  close: CashClose;
  accountName: string;
  accountType: CashAccountType;
  currency: "PEN" | "USD";
  denominations: CloseDenomination[];
  statement: Payment[];
  open: boolean;
  onClose: () => void;
}

function Money({ value, currency }: { value: number; currency: "PEN" | "USD" }) {
  return <span className="tabular-nums">{formatCurrency(value, currency)}</span>;
}

/**
 * Acta de arqueo imprimible (SPEC 51). Se monta en un portal sobre el body;
 * la impresión oculta el resto de la app (mismo patrón que el recibo térmico).
 * El tamaño A4 se inyecta solo mientras el acta está montada para no afectar
 * la impresión de recibos.
 */
export function CuadreActa({
  close,
  accountName,
  accountType,
  currency,
  denominations,
  statement,
  open,
  onClose,
}: CuadreActaProps) {
  const isBank = accountType === "BANK_ACCOUNT";
  const countedTotal =
    denominations.length > 0
      ? sumDenominationCounts(denominations)
      : (close.countedBalance ?? 0);
  const changeFund = close.changeFund ?? 0;
  const net = netCash(countedTotal, changeFund);
  const result =
    close.difference === null
      ? null
      : close.difference === 0
        ? "Cuadrado"
        : close.difference < 0
          ? "Faltante"
          : "Sobrante";
  const receiptSequence = summarizeReceiptSequence(statement);
  const receiptRanges = formatReceiptRanges(receiptSequence);

  useEffect(() => {
    if (!open) {
      return;
    }

    const pageStyle = document.createElement("style");
    pageStyle.setAttribute("data-cuadre-page", "true");
    pageStyle.textContent = "@page { size: A4; margin: 12mm; }";
    document.head.appendChild(pageStyle);

    const handleAfterPrint = () => {
      onClose();
    };

    window.addEventListener("afterprint", handleAfterPrint);
    // El navegador abre su diálogo; `afterprint` avisa cuando termina.
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
      className="cuadre-print-portal bg-white p-2 text-[11px] leading-snug text-black"
      style={{ width: "186mm" }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-black pb-2">
        <div>
          <h1 className="text-[15px] font-bold uppercase">
            {isBank ? "Cuadre de cuenta bancaria" : "Acta de arqueo de caja"}
          </h1>
          <p className="mt-1 text-[12px] font-semibold">{accountName}</p>
        </div>
        <div className="text-right">
          <p>
            Período: {formatDate(close.periodStart)} —{" "}
            {formatDate(close.periodEnd)}
          </p>
          <p>Periodicidad: {getPeriodicityLabel(close.periodicity)}</p>
          <p>Impreso: {formatDate(getTodayLocalDate())}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1">
        <div className="flex justify-between border-b border-dotted border-neutral-400">
          <span>Saldo inicial</span>
          <Money value={close.openingBalance} currency={currency} />
        </div>
        <div className="flex justify-between border-b border-dotted border-neutral-400">
          <span>Ingresos del período</span>
          <Money value={close.incomeTotal} currency={currency} />
        </div>
        <div className="flex justify-between border-b border-dotted border-neutral-400">
          <span>Egresos del período</span>
          <Money value={close.expenseTotal} currency={currency} />
        </div>
        <div className="flex justify-between border-b border-dotted border-neutral-400">
          <span>Transferencias (entradas − salidas)</span>
          <Money
            value={close.transferInTotal - close.transferOutTotal}
            currency={currency}
          />
        </div>
        <div className="flex justify-between border-b border-neutral-600 font-semibold">
          <span>Saldo según registros (C)</span>
          <Money value={close.expectedBalance} currency={currency} />
        </div>
      </div>

      {isBank ? (
        <table className="mt-4 w-full border-collapse">
          <tbody>
            <tr>
              <td className="w-1/2 border border-black p-1">
                Saldo según extracto
              </td>
              <td className="border border-black p-1 text-right tabular-nums">
                {formatCurrency(close.countedBalance ?? 0, currency)}
              </td>
            </tr>
            <tr>
              <td className="border border-black p-1 font-semibold">
                Diferencia
              </td>
              <td className="border border-black p-1 text-right font-semibold tabular-nums">
                {formatCurrency(close.difference ?? 0, currency)}
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <>
          <table className="mt-4 w-full border-collapse">
            <thead>
              <tr>
                <th className="border border-black p-1 text-left">
                  Denominación
                </th>
                <th className="w-24 border border-black p-1 text-right">
                  Cantidad
                </th>
                <th className="w-32 border border-black p-1 text-right">
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody>
              {denominations.map((row) => (
                <tr key={row.denomination}>
                  <td className="border border-black p-1">
                    {denominationKind(row.denomination)}{" "}
                    {formatDenomination(row.denomination)}
                  </td>
                  <td className="border border-black p-1 text-right tabular-nums">
                    {row.quantity}
                  </td>
                  <td className="border border-black p-1 text-right tabular-nums">
                    {formatCurrency(
                      row.denomination * row.quantity,
                      currency
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="border border-black p-1 font-semibold">
                  Total valores en caja (A)
                </td>
                <td className="border border-black p-1" />
                <td className="border border-black p-1 text-right font-semibold tabular-nums">
                  {formatCurrency(countedTotal, currency)}
                </td>
              </tr>
              <tr>
                <td className="border border-black p-1">
                  Menos fondo de cambio (B)
                </td>
                <td className="border border-black p-1" />
                <td className="border border-black p-1 text-right tabular-nums">
                  {formatCurrency(changeFund, currency)}
                </td>
              </tr>
              <tr>
                <td className="border border-black p-1 font-semibold">
                  Efectivo neto (A − B)
                </td>
                <td className="border border-black p-1" />
                <td className="border border-black p-1 text-right font-semibold tabular-nums">
                  {formatCurrency(net, currency)}
                </td>
              </tr>
              <tr>
                <td className="border border-black p-1 font-semibold">
                  Diferencia (A − B − C)
                </td>
                <td className="border border-black p-1" />
                <td className="border border-black p-1 text-right font-semibold tabular-nums">
                  {formatCurrency(close.difference ?? 0, currency)}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="mt-2 flex flex-wrap items-center gap-4">
            <p>
              <span className="font-semibold">Resultado:</span>{" "}
              {result ?? "—"}
            </p>
            {close.differenceTolerance !== null ? (
              <p>
                <span className="font-semibold">Tolerancia:</span>{" "}
                {formatCurrency(close.differenceTolerance, currency)}
              </p>
            ) : null}
          </div>
          {close.differenceReason ? (
            <p className="mt-1">
              <span className="font-semibold">Motivo de la diferencia:</span>{" "}
              {close.differenceReason}
            </p>
          ) : null}
        </>
      )}

      <div className="mt-3">
        <p>
          <span className="font-semibold">Recibos del período:</span>{" "}
          {receiptRanges}
        </p>
        <p>
          <span className="font-semibold">Recibos anulados:</span>{" "}
          {receiptSequence.annulled}
        </p>
        {close.notes ? (
          <p>
            <span className="font-semibold">Notas:</span> {close.notes}
          </p>
        ) : null}
      </div>

      <div className="mt-12 grid grid-cols-2 gap-12">
        <div className="flex flex-col items-center gap-1">
          <div className="h-12 w-full" />
          <div className="w-full border-t border-black pt-1 text-center">
            <p className="font-semibold">Firma del cajero</p>
            <p>{close.countedBy || "\u00a0"}</p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-1">
          <div className="h-12 w-full" />
          <div className="w-full border-t border-black pt-1 text-center">
            <p className="font-semibold">Firma del arqueador</p>
            <p>{close.verifiedBy || "\u00a0"}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
