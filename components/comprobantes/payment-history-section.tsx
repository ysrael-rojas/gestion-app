"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createColumnHelper,
  createPaginatedRowModel,
  rowPaginationFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { Printer } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  PaymentDirection,
  PaymentHistoryEntry,
  PaymentStatus,
} from "@/components/pagos/types";
import { PAYMENT_STATUSES } from "@/lib/data/payment-options";
import { getOptionLabel } from "@/lib/data/sale-options";
import { getPaymentHistory } from "@/lib/pagos/pagos";
import { formatCurrency, formatDate } from "@/lib/utils";

const COLUMNS_COUNT = 6;
const SKELETON_ROWS = 3;
const DEFAULT_PAGE_SIZE = 10;

const historyTableFeatures = tableFeatures({
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

const historyColumnHelper = createColumnHelper<
  typeof historyTableFeatures,
  PaymentHistoryEntry
>();

interface PaymentHistorySectionProps {
  comprobanteId: string;
  direction: PaymentDirection;
  onPrint: (paymentId: string) => void;
}

function StatusBadge({ status }: { status: PaymentStatus }) {
  const className =
    status === "PROCESADO"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
      : status === "EN_REVISION"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
        : "text-muted-foreground";

  return (
    <Badge variant="outline" className={className}>
      {getOptionLabel(PAYMENT_STATUSES, status)}
    </Badge>
  );
}

function LoadingRows() {
  return (
    <>
      {Array.from({ length: SKELETON_ROWS }).map((_, rowIndex) => (
        <TableRow key={`payment-history-skeleton-${rowIndex}`}>
          {Array.from({ length: COLUMNS_COUNT }).map((_, cellIndex) => (
            <TableCell key={`payment-history-skeleton-${rowIndex}-${cellIndex}`}>
              <Skeleton className="h-5 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function PaymentHistorySection({
  comprobanteId,
  direction,
  onPrint,
}: PaymentHistorySectionProps) {
  const [entries, setEntries] = useState<PaymentHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo(
    () =>
      historyColumnHelper.columns([
        historyColumnHelper.accessor("paymentDate", {
          header: "Fecha de pago",
          cell: ({ getValue }) => formatDate(getValue()),
        }),
        historyColumnHelper.accessor("receiptNumber", {
          header: "Recibo",
          cell: ({ getValue }) => getValue(),
        }),
        historyColumnHelper.accessor("methodName", {
          header: "Método",
          cell: ({ getValue }) => getValue(),
        }),
        historyColumnHelper.accessor("amount", {
          header: () => <div className="text-right">Importe asignado</div>,
          cell: ({ getValue }) => (
            <div className="text-right">{formatCurrency(getValue())}</div>
          ),
        }),
        historyColumnHelper.accessor("status", {
          header: "Estado",
          cell: ({ getValue }) => <StatusBadge status={getValue()} />,
        }),
        historyColumnHelper.display({
          id: "actions",
          header: () => <div className="text-right">Acciones</div>,
          cell: ({ row }) => (
            <div className="text-right">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="outline"
                      size="icon-sm"
                      onClick={() => onPrint(row.original.paymentId)}
                    />
                  }
                >
                  <Printer />
                  <span className="sr-only">Imprimir recibo</span>
                </TooltipTrigger>
                <TooltipContent>Imprimir recibo</TooltipContent>
              </Tooltip>
            </div>
          ),
        }),
      ]),
    [onPrint]
  );

  const table = useTable({
    features: historyTableFeatures,
    data: entries,
    columns,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: DEFAULT_PAGE_SIZE,
      },
    },
  });

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await getPaymentHistory(comprobanteId);

        if (isMounted) {
          setEntries(data);
        }
      } catch (err) {
        if (isMounted) {
          const message =
            err instanceof Error
              ? err.message
              : "No se pudo cargar el historial de pagos. Intenta nuevamente.";
          setEntries([]);
          setError(message);
          toast.error(message);
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
  }, [comprobanteId, direction]);

  return (
    <TooltipProvider>
      <Card className="bg-muted/30 ring-0">
        <CardHeader>
          <CardTitle>Historial de pagos</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : !isLoading && entries.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-6 text-center">
              <p className="text-sm font-medium">
                Aún no se han registrado pagos para este comprobante.
              </p>
              <p className="text-sm text-muted-foreground">
                Puedes registrar uno desde el botón Registrar pago de arriba.
              </p>
            </div>
          ) : (
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
                    {isLoading ? (
                      <LoadingRows />
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
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
