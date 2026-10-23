"use client";

import type { VoucherKind } from "@/components/comprobantes/types";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { VoucherAdjustment } from "@/lib/comprobantes/notas";
import { NOTE_MOTIVES } from "@/lib/data/nota-options";
import { getOptionLabel } from "@/lib/data/sale-options";
import { formatCurrency, formatDate } from "@/lib/utils";

type AdjustmentGroup = "notas" | "retenciones";

interface VoucherAdjustmentsSectionProps {
  group: AdjustmentGroup;
  /** `null` mientras cargan los ajustes del comprobante. */
  adjustments: VoucherAdjustment[] | null;
  error?: string | null;
  voucherKind: VoucherKind;
}

const SKELETON_ROWS = 3;

function TotalItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{formatCurrency(value)}</span>
    </div>
  );
}

function motiveLabel(adjustment: VoucherAdjustment): string {
  if (
    adjustment.voucherType === "NOTA_CREDITO" ||
    adjustment.voucherType === "NOTA_DEBITO"
  ) {
    return getOptionLabel(
      NOTE_MOTIVES[adjustment.voucherType],
      adjustment.motiveCode ?? ""
    );
  }

  return "—";
}

export function VoucherAdjustmentsSection({
  group,
  adjustments,
  error,
  voucherKind,
}: VoucherAdjustmentsSectionProps) {
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (adjustments === null) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: SKELETON_ROWS }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  const isNotes = group === "notas";
  const rows = adjustments.filter((adjustment) =>
    isNotes
      ? adjustment.voucherType !== "COMPROBANTE_RETENCION"
      : adjustment.voucherType === "COMPROBANTE_RETENCION"
  );

  const creditTotal = adjustments
    .filter((adjustment) => adjustment.voucherType === "NOTA_CREDITO")
    .reduce((sum, adjustment) => sum + adjustment.total, 0);
  const debitTotal = adjustments
    .filter((adjustment) => adjustment.voucherType === "NOTA_DEBITO")
    .reduce((sum, adjustment) => sum + adjustment.total, 0);
  const retainedTotal = adjustments
    .filter((adjustment) => adjustment.voucherType === "COMPROBANTE_RETENCION")
    .reduce((sum, adjustment) => sum + adjustment.total, 0);

  const emptyMessage = isNotes
    ? "Este comprobante no tiene notas de crédito ni de débito aplicadas."
    : voucherKind === "COMPRA"
      ? "No hay retenciones aplicadas a esta compra. Las retenciones se registran en Retenciones y hoy solo se reciben sobre ventas."
      : "Este comprobante no tiene retenciones aplicadas.";

  return (
    <div className="flex flex-col gap-4">
      {rows.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3">
          {isNotes ? (
            <>
              <TotalItem label="Notas de crédito" value={creditTotal} />
              <TotalItem label="Notas de débito" value={debitTotal} />
            </>
          ) : (
            <TotalItem label="Retenido" value={retainedTotal} />
          )}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {isNotes ? <TableHead>Tipo</TableHead> : null}
                <TableHead>Número</TableHead>
                <TableHead>Emisión</TableHead>
                {isNotes ? <TableHead>Motivo</TableHead> : null}
                <TableHead className="text-right">
                  {isNotes ? "Total" : "Total retenido"}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((adjustment) => (
                <TableRow key={adjustment.id}>
                  {isNotes ? (
                    <TableCell>
                      {adjustment.voucherType === "NOTA_CREDITO"
                        ? "Nota de crédito"
                        : "Nota de débito"}
                    </TableCell>
                  ) : null}
                  <TableCell>{adjustment.voucherNumber}</TableCell>
                  <TableCell>
                    {formatDate(adjustment.issueDate)}
                  </TableCell>
                  {isNotes ? (
                    <TableCell>{motiveLabel(adjustment)}</TableCell>
                  ) : null}
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(adjustment.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
