"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createColumnHelper,
  createPaginatedRowModel,
  rowPaginationFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DataTablePagination } from "@/components/shared/data-table-pagination";
import {
  getPenUsdRate,
  listCashPositions,
  type CashAccountPosition,
} from "@/lib/caja/caja";
import { getPeriodicityLabel } from "@/lib/data/cash-options";
import { formatCurrency, getTodayLocalDate } from "@/lib/utils";

const SKELETON_ROWS = 4;
const DEFAULT_PAGE_SIZE = 10;

const cuentasTableFeatures = tableFeatures({
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

interface AccountPositionRow {
  id: string;
  isBank: boolean;
  name: string;
  bankName: string;
  currency: string;
  closing: string;
  balanceLabel: string;
}

const cuentasColumnHelper = createColumnHelper<
  typeof cuentasTableFeatures,
  AccountPositionRow
>();

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

export function CuentasView() {
  const today = getTodayLocalDate();
  const [positions, setPositions] = useState<CashAccountPosition[]>([]);
  const [penUsdRate, setPenUsdRate] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      setIsLoading(true);

      try {
        const [data, rate] = await Promise.all([
          listCashPositions(today),
          getPenUsdRate(),
        ]);

        if (isMounted) {
          setPositions(data);
          setPenUsdRate(rate);
          setError(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudieron cargar las cuentas."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [today]);

  const hasForeignCurrency = positions.some(
    (position) => position.account.currency !== "PEN"
  );

  const consolidated = positions.reduce((total, position) => {
    if (position.account.currency === "PEN") {
      return total + position.balance;
    }
    if (penUsdRate === null) {
      return total;
    }
    return total + position.balance * penUsdRate;
  }, 0);

  const rows = useMemo<AccountPositionRow[]>(
    () =>
      positions.map(({ account, balance }) => ({
        id: account.id,
        isBank: account.type === "BANK_ACCOUNT",
        name: account.name,
        bankName: account.bankName ?? "—",
        currency: account.currency,
        closing: account.closingPeriodicity
          ? getPeriodicityLabel(account.closingPeriodicity)
          : "Predeterminado",
        balanceLabel: formatAmount(balance, account.currency),
      })),
    [positions]
  );

  const columns = useMemo(
    () =>
      cuentasColumnHelper.columns([
        cuentasColumnHelper.accessor("isBank", {
          header: "Tipo",
          cell: ({ getValue }) =>
            getValue() ? (
              <Badge variant="default">Banco</Badge>
            ) : (
              <Badge variant="secondary">Caja</Badge>
            ),
        }),
        cuentasColumnHelper.accessor("name", {
          header: "Nombre",
          cell: ({ getValue }) => (
            <span className="font-medium">{getValue()}</span>
          ),
        }),
        cuentasColumnHelper.accessor("bankName", {
          header: "Banco",
          cell: ({ getValue }) => getValue(),
        }),
        cuentasColumnHelper.accessor("currency", {
          header: "Moneda",
          cell: ({ getValue }) => getValue(),
        }),
        cuentasColumnHelper.accessor("closing", {
          header: "Cierre",
          cell: ({ getValue }) => getValue(),
        }),
        cuentasColumnHelper.accessor("balanceLabel", {
          header: () => <div className="text-right">Saldo a hoy</div>,
          cell: ({ getValue }) => (
            <div className="text-right font-medium">{getValue()}</div>
          ),
        }),
      ]),
    []
  );

  const table = useTable({
    features: cuentasTableFeatures,
    data: rows,
    columns,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: DEFAULT_PAGE_SIZE,
      },
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <Card className="bg-muted/30 ring-0">
        <CardHeader>
          <CardTitle>Total consolidado (PEN)</CardTitle>
        </CardHeader>
        <CardContent className="text-2xl font-semibold">
          {formatCurrency(consolidated)}
          {hasForeignCurrency && penUsdRate === null ? (
            <p className="mt-1 text-xs font-normal text-destructive">
              Falta el tipo de cambio PEN/USD en Configuración: las cuentas en
              otra moneda no se suman al total.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-md border">
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
              {isLoading ? (
                Array.from({ length: SKELETON_ROWS }).map((_, index) => (
                  <TableRow key={`skeleton-${index}`}>
                    {Array.from({ length: columns.length }).map((_, cell) => (
                      <TableCell key={`skeleton-${index}-${cell}`}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No hay cajas ni bancos registrados.
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
    </div>
  );
}
