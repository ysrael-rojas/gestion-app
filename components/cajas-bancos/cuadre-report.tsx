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
import {
  StatementTable,
  buildStatementRows,
} from "@/components/cajas-bancos/statement-table";
import { downloadCsv, toCsv } from "@/lib/caja/csv";
import {
  formatReceiptRanges,
  summarizeReceiptSequence,
} from "@/lib/caja/reportes";
import { getOptionLabel } from "@/lib/data/sale-options";
import { PAYMENT_STATUSES } from "@/lib/data/payment-options";
import {
  denominationKind,
  formatDenomination,
  netCash,
  sumDenominationCounts,
} from "@/lib/caja/denominaciones";
import type { CashClose, Payment } from "@/components/pagos/types";
import type { CloseDenomination } from "@/lib/caja/caja";
import type { CashTransfer } from "@/lib/caja/transferencias";
import type { CashAccountType } from "@/lib/schemas/cash-account";
import { formatCurrency, formatDate } from "@/lib/utils";

interface CuadreReportProps {
  close: CashClose;
  statement: Payment[];
  transfers: CashTransfer[];
  accountId: string;
  accountName: string;
  currency: string;
  /** Tipo de cuenta: define la etiqueta del conteo (caja vs. banco). */
  accountType: CashAccountType;
  /** Detalle del conteo por denominación (vacío en bancos y cierres previos). */
  denominations: CloseDenomination[];
  /** Fondo de cambio de la cuenta al momento de ver el reporte. */
  changeFund: number;
  /** Marca recibos como verificados (EN_REVISION → PROCESADO). */
  onMarkVerified?: (paymentIds: string[]) => Promise<void> | void;
  /** Abre el registro de un cargo bancario del período. */
  onRegisterBankCharge?: () => void;
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
    // Los recibos anulados no suman en el resumen: así cuadra con los totales
    // de Ingresos y Egresos. Su rastro sigue en Movimientos con su estado.
    if (payment.status === "ANULADO") {
      continue;
    }
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

interface DenominationTotals {
  counted: number;
  changeFund: number;
  net: number;
}

/** Tabla del arqueo: conteo por denominación y cierre del acta (A, B, A−B). */
function DenominationTable({
  denominations,
  totals,
  currency,
}: {
  denominations: CloseDenomination[];
  totals: DenominationTotals;
  currency: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Denominación</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {denominations.map((row) => (
              <TableRow key={row.denomination}>
                <TableCell>
                  <span className="text-muted-foreground">
                    {denominationKind(row.denomination)}
                  </span>{" "}
                  {formatDenomination(row.denomination)}
                </TableCell>
                <TableCell className="text-right">{row.quantity}</TableCell>
                <TableCell className="text-right">
                  {formatAmount(row.denomination * row.quantity, currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-1 rounded-md border bg-background p-4">
        <SummaryRow
          label="Total valores en caja (A)"
          value={formatAmount(totals.counted, currency)}
          strong
        />
        <SummaryRow
          label="Menos fondo de cambio (B)"
          value={formatAmount(totals.changeFund, currency)}
        />
        <SummaryRow
          label="Efectivo neto (A − B)"
          value={formatAmount(totals.net, currency)}
          strong
        />
      </div>
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
  accountType,
  denominations,
  changeFund,
  onMarkVerified,
  onRegisterBankCharge,
}: CuadreReportProps) {
  const isBank = accountType === "BANK_ACCOUNT";
  const countedLabel = isBank ? "Saldo según extracto" : "Conteo físico";
  // El cierre congela el fondo de cambio; los cierres históricos sin snapshot
  // caen al valor actual de la cuenta.
  const effectiveChangeFund = close.changeFund ?? changeFund;
  const categories = groupByCategory(statement);
  const statementRows = buildStatementRows(statement, transfers, accountId);
  // El detalle manda cuando existe: A = suma del conteo. Si el cierre es previo
  // al arqueo por denominación, se usa el conteo total guardado.
  const countedTotal =
    denominations.length > 0
      ? sumDenominationCounts(denominations)
      : (close.countedBalance ?? 0);
  const totals: DenominationTotals = {
    counted: countedTotal,
    changeFund: effectiveChangeFund,
    net: netCash(countedTotal, effectiveChangeFund),
  };
  const hasArqueo = denominations.length > 0 || effectiveChangeFund > 0;
  const differenceResult =
    close.difference === null
      ? null
      : close.difference === 0
        ? "Cuadrado"
        : close.difference < 0
          ? "Faltante"
          : "Sobrante";
  // Secuencia de recibos del período (SPEC 49): primer/último por prefijo y
  // anulados, como pide el formato de arqueo.
  const receiptSequence = summarizeReceiptSequence(statement);
  const receiptRangesLabel = formatReceiptRanges(receiptSequence);

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
      ["Recibos del período", receiptRangesLabel],
      ["Recibos anulados", receiptSequence.annulled],
      ["Saldo esperado", close.expectedBalance],
      [countedLabel, close.countedBalance ?? ""],
      ["Diferencia", close.difference ?? ""],
      ["Resultado del arqueo", differenceResult ?? ""],
      ["Tolerancia permitida", close.differenceTolerance ?? ""],
      ["Motivo de la diferencia", close.differenceReason ?? ""],
      [],
      ...(hasArqueo
        ? ([
            ["Arqueo por denominación"],
            ["Denominación", "Cantidad", "Subtotal"],
            ...denominations.map((row) => [
              formatDenomination(row.denomination),
              row.quantity,
              row.denomination * row.quantity,
            ]),
            ["Total valores en caja (A)", "", totals.counted],
            ["Menos fondo de cambio (B)", "", totals.changeFund],
            ["Efectivo neto (A − B)", "", totals.net],
            [],
          ] as (string | number | null)[][])
        : []),
      ["Resumen por categoría"],
      ["Dirección", "Categoría", "Total"],
      ...categories.map((item) => [item.direction, item.category, item.total]),
      [],
      ["Movimientos"],
      [
        "Fecha",
        "Tipo",
        "Recibo",
        "Dirección",
        "Categoría",
        "Método",
        "Importe",
        "Estado",
      ],
      ...statementRows.map((row) => [
        row.date,
        row.kind === "TRANSFER" ? "Transferencia" : "Recibo",
        row.ref,
        row.direction,
        row.category,
        row.method,
        row.amount,
        // Las transferencias no son recibos: no tienen estado de conciliación.
        row.status ? getOptionLabel(PAYMENT_STATUSES, row.status) : "—",
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
            label="Recibos del período"
            value={receiptRangesLabel}
          />
          <SummaryRow
            label="Recibos anulados"
            value={String(receiptSequence.annulled)}
          />
          <SummaryRow
            label="Saldo esperado"
            value={formatAmount(close.expectedBalance, currency)}
            strong
          />
          {close.countedBalance !== null ? (
            <>
              <SummaryRow
                label={countedLabel}
                value={formatAmount(close.countedBalance, currency)}
              />
              <SummaryRow
                label="Diferencia (sobrante/faltante)"
                value={formatAmount(close.difference ?? 0, currency)}
                strong
              />
              {differenceResult ? (
                <SummaryRow
                  label="Resultado del arqueo"
                  value={differenceResult}
                />
              ) : null}
              {close.differenceTolerance !== null ? (
                <SummaryRow
                  label="Tolerancia permitida"
                  value={formatAmount(close.differenceTolerance, currency)}
                />
              ) : null}
              {close.differenceReason ? (
                <SummaryRow
                  label="Motivo de la diferencia"
                  value={close.differenceReason}
                />
              ) : null}
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

        {hasArqueo ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Arqueo por denominación</h3>
            <DenominationTable
              denominations={denominations}
              totals={totals}
              currency={currency}
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Resumen por categoría</h3>
          <CategoryTotalsTable categories={categories} currency={currency} />
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Movimientos</h3>
          <StatementTable
            rows={statementRows}
            currency={currency}
            onMarkVerified={onMarkVerified}
            onRegisterBankCharge={onRegisterBankCharge}
          />
        </div>
      </CardContent>
    </Card>
  );
}
