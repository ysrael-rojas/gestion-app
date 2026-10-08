"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  getLastMovementDate,
  getPenUsdRate,
  listCashPositions,
  type CashAccountPosition,
} from "@/lib/caja/caja";
import { getPeriodicityLabel } from "@/lib/data/cash-options";
import { formatCurrency, formatDate, getTodayLocalDate } from "@/lib/utils";

const SKELETON_ROWS = 4;
const DEFAULT_PAGE_SIZE = 10;

const cuentasTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});

interface AccountPositionRow {
  id: string;
  isBank: boolean;
  name: string;
  bankName: string;
  currency: string;
  closing: string;
  balance: number;
  sharePercent: number;
  equivalentPen: number;
  lastMovementDate: string | null;
  balanceLabel: string;
}

type AccountFilterValue = "ALL" | "CASH_BOX" | "BANK_ACCOUNT";

const ACCOUNT_FILTER_ITEMS: { value: AccountFilterValue; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "CASH_BOX", label: "Caja" },
  { value: "BANK_ACCOUNT", label: "Banco" },
];

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

function toPen(
  balance: number,
  currency: string,
  penUsdRate: number | null
): number {
  if (currency === "PEN") {
    return balance;
  }
  return penUsdRate ? balance * penUsdRate : 0;
}

export function CuentasView() {
  const today = getTodayLocalDate();
  const [positions, setPositions] = useState<CashAccountPosition[]>([]);
  const [penUsdRate, setPenUsdRate] = useState<number | null>(null);
  const [lastMovements, setLastMovements] = useState<
    Record<string, string | null>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<AccountFilterValue>("ALL");

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      setIsLoading(true);

      try {
        const [data, rate] = await Promise.all([
          listCashPositions(today),
          getPenUsdRate(),
        ]);

        const movements = await Promise.all(
          data.map(async (position) => {
            const date = await getLastMovementDate(position.account.id);
            return [position.account.id, date] as const;
          })
        );

        if (isMounted) {
          setPositions(data);
          setPenUsdRate(rate);
          setLastMovements(Object.fromEntries(movements));
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

  const consolidated = positions.reduce(
    (total, position) =>
      total + toPen(position.balance, position.account.currency, penUsdRate),
    0
  );

  const cashTotal = positions.reduce(
    (total, position) =>
      position.account.type === "CASH_BOX"
        ? total + toPen(position.balance, position.account.currency, penUsdRate)
        : total,
    0
  );

  const bankTotal = positions.reduce(
    (total, position) =>
      position.account.type === "BANK_ACCOUNT"
        ? total + toPen(position.balance, position.account.currency, penUsdRate)
        : total,
    0
  );

  const rows = useMemo<AccountPositionRow[]>(
    () =>
      positions.map(({ account, balance }) => {
        const equivalentPen = toPen(balance, account.currency, penUsdRate);
        return {
          id: account.id,
          isBank: account.type === "BANK_ACCOUNT",
          name: account.name,
          bankName: account.bankName ?? "—",
          currency: account.currency,
          closing: account.closingPeriodicity
            ? getPeriodicityLabel(account.closingPeriodicity)
            : "Predeterminado",
          balance,
          sharePercent:
            consolidated > 0 ? (equivalentPen / consolidated) * 100 : 0,
          equivalentPen,
          lastMovementDate: lastMovements[account.id] ?? null,
          balanceLabel: formatAmount(balance, account.currency),
        };
      }),
    [positions, penUsdRate, consolidated, lastMovements]
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesType =
        filterType === "ALL" ||
        (filterType === "CASH_BOX" && !row.isBank) ||
        (filterType === "BANK_ACCOUNT" && row.isBank);

      if (!matchesType) {
        return false;
      }
      if (!term) {
        return true;
      }

      return (
        row.name.toLowerCase().includes(term) ||
        row.bankName.toLowerCase().includes(term)
      );
    });
  }, [rows, search, filterType]);

  const columns = useMemo(
    () =>
      cuentasColumnHelper.columns([
        cuentasColumnHelper.accessor("isBank", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Tipo" />
          ),
          cell: ({ getValue }) =>
            getValue() ? (
              <Badge variant="default">Banco</Badge>
            ) : (
              <Badge variant="secondary">Caja</Badge>
            ),
        }),
        cuentasColumnHelper.accessor("name", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Nombre" />
          ),
          cell: ({ getValue }) => (
            <span className="font-medium">{getValue()}</span>
          ),
        }),
        cuentasColumnHelper.accessor("bankName", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Banco" />
          ),
          cell: ({ getValue }) => getValue(),
        }),
        cuentasColumnHelper.accessor("currency", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Moneda" />
          ),
          cell: ({ getValue }) => getValue(),
        }),
        cuentasColumnHelper.accessor("closing", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Cierre" />
          ),
          cell: ({ getValue }) => getValue(),
        }),
        cuentasColumnHelper.accessor("balance", {
          id: "balance",
          header: ({ column }) => (
            <DataTableColumnHeader
              column={column}
              title="Saldo a hoy"
              align="right"
            />
          ),
          cell: ({ row }) => (
            <div className="text-right font-medium">
              {row.original.balanceLabel}
            </div>
          ),
        }),
        cuentasColumnHelper.accessor("sharePercent", {
          header: ({ column }) => (
            <DataTableColumnHeader
              column={column}
              title="% del total"
              align="right"
            />
          ),
          cell: ({ getValue }) => (
            <div className="text-right">{getValue().toFixed(1)}%</div>
          ),
        }),
        cuentasColumnHelper.accessor("equivalentPen", {
          header: ({ column }) => (
            <DataTableColumnHeader
              column={column}
              title="Equivalente PEN"
              align="right"
            />
          ),
          cell: ({ getValue }) => (
            <div className="text-right">{formatCurrency(getValue())}</div>
          ),
        }),
        cuentasColumnHelper.accessor("lastMovementDate", {
          header: ({ column }) => (
            <DataTableColumnHeader column={column} title="Último movimiento" />
          ),
          cell: ({ getValue }) => {
            const value = getValue();
            return value ? formatDate(value) : "—";
          },
        }),
      ]),
    []
  );

  const table = useTable({
    features: cuentasTableFeatures,
    data: filteredRows,
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

  const hasFilters = search.trim() !== "" || filterType !== "ALL";

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-muted/30 ring-0">
          <CardHeader>
            <CardTitle className="text-sm">Total consolidado (PEN)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatCurrency(consolidated)}
            {hasForeignCurrency && penUsdRate === null ? (
              <p className="mt-1 text-xs font-normal text-destructive">
                Falta el tipo de cambio PEN/USD en Configuración: las cuentas
                en otra moneda no se suman al total.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="bg-muted/30 ring-0">
          <CardHeader>
            <CardTitle className="text-sm">Cuentas registradas</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {positions.length}
          </CardContent>
        </Card>

        <Card className="bg-muted/30 ring-0">
          <CardHeader>
            <CardTitle className="text-sm">Saldo en cajas (PEN)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatCurrency(cashTotal)}
          </CardContent>
        </Card>

        <Card className="bg-muted/30 ring-0">
          <CardHeader>
            <CardTitle className="text-sm">Saldo en bancos (PEN)</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">
            {formatCurrency(bankTotal)}
          </CardContent>
        </Card>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {/* Línea de controles: búsqueda + filtro de tipo, fuera del datatable. */}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por nombre o banco…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="max-w-sm"
            aria-label="Buscar cuentas"
          />
          <Select
            value={filterType}
            items={ACCOUNT_FILTER_ITEMS}
            onValueChange={(value) => {
              if (value === null) return;
              setFilterType(value);
            }}
          >
            <SelectTrigger aria-label="Filtrar por tipo" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_FILTER_ITEMS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

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
                    {hasFilters
                      ? "No se encontraron cuentas con los filtros aplicados."
                      : "No hay cajas ni bancos registrados."}
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
    </main>
  );
}
