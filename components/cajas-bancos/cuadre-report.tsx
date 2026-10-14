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
import { Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "@/components/shared/data-table-pagination";
import { DataTableColumnHeader } from "@/components/shared/data-table-column-header";
import { downloadCsv, toCsv } from "@/lib/caja/csv";
import type { CashClose, Payment } from "@/components/pagos/types";
import type { CashTransfer } from "@/lib/caja/transferencias";
import { formatCurrency, formatDate } from "@/lib/utils";

interface CuadreReportProps {
  close: CashClose;
  statement: Payment[];
  transfers: CashTransfer[];
  accountId: string;
  accountName: string;
  currency: string;
}

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

interface CategoryTotal {
  direction: "INGRESO" | "EGRESO";
  category: string;
  total: number;
}

function groupByCategory(statement: Payment[]): CategoryTotal[] {
  const map = new Map<string, CategoryTotal>();

  for (const payment of statement) {
    const key = `${payment.direction}|${payment.categoryName}`;
    const current = map.get(key);
    if (current) {
      current.total += payment.amount;
    } else {
      map.set(key, {
        direction: payment.direction,
        category: payment.categoryName || "Sin categoría",
        total: payment.amount,
      });
    }
  }

  return [...map.values()].sort((a, b) => {
    if (a.direction !== b.direction) {
      return a.direction === "INGRESO" ? -1 : 1;
    }
    return b.total - a.total;
  });
}

const reportTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});

const categoryColumnHelper = createColumnHelper<
  typeof reportTableFeatures,
  CategoryTotal
>();

interface StatementRow {
  id: string;
  kind: "PAYMENT" | "TRANSFER";
  date: string;
  ref: string;
  direction: "INGRESO" | "EGRESO";
  category: string;
  method: string;
  amount: number;
}

function buildStatementRows(
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
    };
  });

  return [...paymentRows, ...transferRows].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

const statementRowColumnHelper = createColumnHelper<
  typeof reportTableFeatures,
  StatementRow
>();

const DEFAULT_PAGE_SIZE = 10;

interface CategoryTotalsTableProps {
  categories: CategoryTotal[];
  currency: string;
}

function CategoryTotalsTable({
  categories,
  currency,
}: CategoryTotalsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () =>
      categoryColumnHelper.columns([
        categoryColumnHelper.accessor("direction", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Dirección" />
          ),
          cell: ({ getValue }) =>
            getValue() === "INGRESO" ? "Ingreso" : "Egreso",
        }),
        categoryColumnHelper.accessor("category", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Categoría" />
          ),
          cell: ({ getValue }) => getValue(),
        }),
        categoryColumnHelper.accessor("total", {
          header: ({ column }) => (
            <DataTableColumnHeader
              column={column}
              title="Total"
              align="right"
            />
          ),
          cell: ({ getValue }) => (
            <div className="text-right">
              {formatAmount(getValue(), currency)}
            </div>
          ),
        }),
      ]),
    [currency]
  );

  const table = useTable({
    features: reportTableFeatures,
    data: categories,
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

interface StatementTableProps {
  rows: StatementRow[];
  currency: string;
}

function StatementTable({ rows, currency }: StatementTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () =>
      statementRowColumnHelper.columns([
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
      ]),
    [currency]
  );

  const table = useTable({
    features: reportTableFeatures,
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

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={strong ? "font-medium" : "text-muted-foreground"}>
        {label}
      </span>
      <span className={strong ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}

export function CuadreReport({
  close,
  statement,
  transfers,
  accountId,
  accountName,
  currency,
}: CuadreReportProps) {
  const categories = groupByCategory(statement);
  const statementRows = buildStatementRows(statement, transfers, accountId);

  function handleExport() {
    const rows: (string | number | null)[][] = [
      ["Cuadre de caja"],
      ["Cuenta", accountName],
      ["Periodo", `${close.periodStart} a ${close.periodEnd}`],
      ["Periodicidad", close.periodicity],
      [],
      ["Saldo inicial", close.openingBalance],
      ["Ingresos", close.incomeTotal],
      ["Egresos", close.expenseTotal],
      ["Saldo esperado", close.expectedBalance],
      ["Conteo físico", close.countedBalance ?? ""],
      ["Diferencia", close.difference ?? ""],
      [],
      ["Resumen por categoría"],
      ["Dirección", "Categoría", "Total"],
      ...categories.map((item) => [item.direction, item.category, item.total]),
      [],
      ["Movimientos"],
      ["Fecha", "Tipo", "Recibo", "Dirección", "Categoría", "Método", "Importe"],
      ...statementRows.map((row) => [
        row.date,
        row.kind === "TRANSFER" ? "Transferencia" : "Recibo",
        row.ref,
        row.direction,
        row.category,
        row.method,
        row.amount,
      ]),
    ];

    downloadCsv(`cuadre-${accountName}-${close.periodEnd}.csv`, toCsv(rows));
  }

  return (
    <Card className="bg-muted/30 ring-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>
          Cuadre {formatDate(close.periodStart)} — {formatDate(close.periodEnd)}
        </CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download />
          Exportar CSV
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-1 rounded-md border bg-background p-4">
          <SummaryRow
            label="Saldo inicial"
            value={formatAmount(close.openingBalance, currency)}
          />
          <SummaryRow
            label="Ingresos"
            value={formatAmount(close.incomeTotal, currency)}
          />
          <SummaryRow
            label="Egresos"
            value={formatAmount(close.expenseTotal, currency)}
          />
          <SummaryRow
            label="Saldo esperado"
            value={formatAmount(close.expectedBalance, currency)}
            strong
          />
          {close.countedBalance !== null ? (
            <>
              <SummaryRow
                label="Conteo físico"
                value={formatAmount(close.countedBalance, currency)}
              />
              <SummaryRow
                label="Diferencia (sobrante/faltante)"
                value={formatAmount(close.difference ?? 0, currency)}
                strong
              />
            </>
          ) : null}
          {close.penUsdRate !== null ? (
            <SummaryRow
              label="Tipo de cambio usado"
              value={String(close.penUsdRate)}
            />
          ) : null}
          {close.notes ? <SummaryRow label="Notas" value={close.notes} /> : null}
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Resumen por categoría</h3>
          <CategoryTotalsTable categories={categories} currency={currency} />
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Movimientos</h3>
          <StatementTable rows={statementRows} currency={currency} />
        </div>
      </CardContent>
    </Card>
  );
}
