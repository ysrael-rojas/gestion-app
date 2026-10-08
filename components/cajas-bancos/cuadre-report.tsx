"use client";

import { useMemo } from "react";
import {
  createColumnHelper,
  createPaginatedRowModel,
  rowPaginationFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { Download } from "lucide-react";

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
import { downloadCsv, toCsv } from "@/lib/caja/csv";
import type { CashClose, Payment } from "@/components/pagos/types";
import { formatCurrency, formatDate } from "@/lib/utils";

interface CuadreReportProps {
  close: CashClose;
  statement: Payment[];
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
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

const categoryColumnHelper = createColumnHelper<
  typeof reportTableFeatures,
  CategoryTotal
>();

const paymentColumnHelper = createColumnHelper<
  typeof reportTableFeatures,
  Payment
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
  const columns = useMemo(
    () =>
      categoryColumnHelper.columns([
        categoryColumnHelper.accessor("direction", {
          header: "Dirección",
          cell: ({ getValue }) =>
            getValue() === "INGRESO" ? "Ingreso" : "Egreso",
        }),
        categoryColumnHelper.accessor("category", {
          header: "Categoría",
          cell: ({ getValue }) => getValue(),
        }),
        categoryColumnHelper.accessor("total", {
          header: () => <div className="text-right">Total</div>,
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
  statement: Payment[];
  currency: string;
}

function StatementTable({ statement, currency }: StatementTableProps) {
  const columns = useMemo(
    () =>
      paymentColumnHelper.columns([
        paymentColumnHelper.accessor("paymentDate", {
          header: "Fecha",
          cell: ({ getValue }) => formatDate(getValue()),
        }),
        paymentColumnHelper.accessor("receiptNumber", {
          header: "Recibo",
          cell: ({ getValue }) => getValue(),
        }),
        paymentColumnHelper.accessor("direction", {
          header: "Dirección",
          cell: ({ getValue }) =>
            getValue() === "INGRESO" ? "Ingreso" : "Egreso",
        }),
        paymentColumnHelper.accessor("categoryName", {
          header: "Categoría",
          cell: ({ getValue }) => getValue() || "—",
        }),
        paymentColumnHelper.accessor("methodName", {
          header: "Método",
          cell: ({ getValue }) => getValue() || "—",
        }),
        paymentColumnHelper.accessor("amount", {
          header: () => <div className="text-right">Importe</div>,
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
    data: statement,
    columns,
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
  accountName,
  currency,
}: CuadreReportProps) {
  const categories = groupByCategory(statement);

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
      ["Fecha", "Recibo", "Dirección", "Categoría", "Método", "Importe"],
      ...statement.map((payment) => [
        payment.paymentDate,
        payment.receiptNumber,
        payment.direction,
        payment.categoryName,
        payment.methodName,
        payment.amount,
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
          <StatementTable statement={statement} currency={currency} />
        </div>
      </CardContent>
    </Card>
  );
}
