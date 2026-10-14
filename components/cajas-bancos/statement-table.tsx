"use client";

import { useMemo, useState } from "react";
import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
  useTable,
  type SortingState,
} from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTableColumnHeader } from "@/components/shared/data-table-column-header";
import { DataTablePagination } from "@/components/shared/data-table-pagination";
import { ReceiptStatusBadge } from "@/components/pagos/receipt-status-badge";
import type { Payment, PaymentStatus } from "@/components/pagos/types";
import type { CashTransfer } from "@/lib/caja/transferencias";
import { formatCurrency, formatDate } from "@/lib/utils";

export interface StatementRow {
  id: string;
  kind: "PAYMENT" | "TRANSFER";
  date: string;
  ref: string;
  direction: "INGRESO" | "EGRESO";
  category: string;
  method: string;
  amount: number;
  /** Estado del recibo; `null` en transferencias (no son recibos). */
  status: PaymentStatus | null;
}

export function buildStatementRows(
  statement: Payment[],
  transfers: CashTransfer[],
  accountId: string
): StatementRow[] {
  const paymentRows: StatementRow[] = statement.map((payment) => ({
    id: payment.id,
    kind: "PAYMENT",
    date: payment.paymentDate,
    ref: payment.receiptNumber,
    direction: payment.direction,
    category: payment.categoryName || "Sin categoría",
    method: payment.methodName || "—",
    amount: payment.amount,
    status: payment.status,
  }));

  const transferRows: StatementRow[] = transfers.map((transfer) => {
    const incoming = transfer.targetAccountId === accountId;
    return {
      id: transfer.id,
      kind: "TRANSFER",
      date: transfer.transferDate,
      ref: "Transferencia",
      direction: incoming ? "INGRESO" : "EGRESO",
      category: "Transferencia entre cuentas",
      method: "—",
      amount: transfer.amount,
      status: null,
    };
  });

  return [...paymentRows, ...transferRows].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

const statementTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});

const statementRowColumnHelper = createColumnHelper<
  typeof statementTableFeatures,
  StatementRow
>();

const DEFAULT_PAGE_SIZE = 10;

function formatAmount(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-PE", {
      style: "currency",
      currency: currency || "PEN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return formatCurrency(value);
  }
}

interface StatementTableProps {
  rows: StatementRow[];
  currency: string;
  /** Marca los recibos indicados como verificados (`EN_REVISION` → `PROCESADO`). */
  onMarkVerified?: (paymentIds: string[]) => Promise<void> | void;
}

/**
 * Movimientos del período con su estado de conciliación. Los recibos en
 * revisión se pueden marcar como verificados (uno por uno o en bloque).
 */
export function StatementTable({
  rows,
  currency,
  onMarkVerified,
}: StatementTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Solo los recibos en revisión pueden marcarse como verificados.
  const markableIds = useMemo(
    () =>
      rows
        .filter((row) => row.kind === "PAYMENT" && row.status === "EN_REVISION")
        .map((row) => row.id),
    [rows]
  );
  const selectedIds = useMemo(
    () => selected.filter((id) => markableIds.includes(id)),
    [selected, markableIds]
  );
  const allSelected =
    markableIds.length > 0 && selectedIds.length === markableIds.length;

  async function mark(ids: string[]) {
    if (!onMarkVerified || ids.length === 0) {
      return;
    }

    setIsSaving(true);
    try {
      await onMarkVerified(ids);
      setSelected([]);
      setIsConfirming(false);
    } finally {
      setIsSaving(false);
    }
  }

  function toggleRow(id: string, checked: boolean) {
    setSelected((current) =>
      checked ? [...current, id] : current.filter((item) => item !== id)
    );
  }

  const columns = useMemo(
    () =>
      statementRowColumnHelper.columns([
        statementRowColumnHelper.display({
          id: "select",
          header: () =>
            markableIds.length > 0 ? (
              <Checkbox
                aria-label="Seleccionar todos los recibos en revisión"
                checked={allSelected}
                onCheckedChange={(checked) =>
                  setSelected(checked === true ? markableIds : [])
                }
              />
            ) : null,
          cell: ({ row }) =>
            row.original.kind === "PAYMENT" &&
            row.original.status === "EN_REVISION" ? (
              <Checkbox
                aria-label={`Seleccionar recibo ${row.original.ref}`}
                checked={selectedIds.includes(row.original.id)}
                onCheckedChange={(checked) =>
                  toggleRow(row.original.id, checked === true)
                }
              />
            ) : null,
        }),
        statementRowColumnHelper.accessor("kind", {
          header: () => <span className="sr-only">Tipo</span>,
          cell: ({ getValue }) =>
            getValue() === "TRANSFER" ? (
              <Badge variant="outline">Transferencia</Badge>
            ) : (
              <Badge variant="secondary">Recibo</Badge>
            ),
        }),
        statementRowColumnHelper.accessor("date", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Fecha" />
          ),
          cell: ({ getValue }) => formatDate(getValue()),
        }),
        statementRowColumnHelper.accessor("ref", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Recibo" />
          ),
          cell: ({ getValue }) => getValue(),
        }),
        statementRowColumnHelper.accessor("direction", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Dirección" />
          ),
          cell: ({ getValue }) =>
            getValue() === "INGRESO" ? "Ingreso" : "Egreso",
        }),
        statementRowColumnHelper.accessor("category", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Categoría" />
          ),
          cell: ({ getValue }) => getValue(),
        }),
        statementRowColumnHelper.accessor("method", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Método" />
          ),
          cell: ({ getValue }) => getValue(),
        }),
        statementRowColumnHelper.accessor("amount", {
          header: ({ column }) => (
            <DataTableColumnHeader
              column={column}
              title="Importe"
              align="right"
            />
          ),
          cell: ({ getValue }) => (
            <div className="text-right">
              {formatAmount(getValue(), currency)}
            </div>
          ),
        }),
        statementRowColumnHelper.accessor("status", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Estado" />
          ),
          cell: ({ getValue }) => {
            const status = getValue();
            return status ? (
              <ReceiptStatusBadge status={status} />
            ) : (
              <span className="text-muted-foreground">—</span>
            );
          },
        }),
        statementRowColumnHelper.display({
          id: "actions",
          header: () => <div className="text-right">Acciones</div>,
          cell: ({ row }) =>
            onMarkVerified &&
            row.original.kind === "PAYMENT" &&
            row.original.status === "EN_REVISION" ? (
              <div className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isSaving}
                  onClick={() => void mark([row.original.id])}
                >
                  Marcar verificado
                </Button>
              </div>
            ) : null,
        }),
      ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currency, onMarkVerified, markableIds, selectedIds, allSelected, isSaving]
  );

  const table = useTable({
    features: statementTableFeatures,
    data: rows,
    columns,
    onSortingChange: setSorting,
    state: { sorting },
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: DEFAULT_PAGE_SIZE,
      },
    },
  });

  return (
    <div className="flex flex-col gap-4">
      {markableIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 p-3 text-sm">
          {isConfirming ? (
            <>
              <span className="font-medium">
                ¿Marcar {selectedIds.length} recibo(s) como verificados? La
                validación no cambia el saldo.
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isSaving}
                  onClick={() => setIsConfirming(false)}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  disabled={isSaving}
                  onClick={() => void mark(selectedIds)}
                >
                  {isSaving ? "Marcando…" : "Confirmar"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={selectedIds.length === 0}
                onClick={() => setIsConfirming(true)}
              >
                Marcar verificados ({selectedIds.length})
              </Button>
              <span className="text-muted-foreground">
                Selecciona los recibos en revisión que ya cuadran con el
                extracto del banco.
              </span>
            </>
          )}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-md border bg-background">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-center text-sm text-muted-foreground"
                >
                  Sin movimientos en el período.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination table={table} />
    </div>
  );
}
