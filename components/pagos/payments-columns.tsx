"use client";

import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table";
import { ArrowUpDown, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Payment, PaymentDirection } from "@/components/pagos/types";
import { ReceiptStatusBadge } from "@/components/pagos/receipt-status-badge";
import { PAYMENT_STATUSES } from "@/lib/data/payment-options";
import { getOptionLabel } from "@/lib/data/sale-options";
import { formatCurrency, formatDate } from "@/lib/utils";

export const paymentsTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});

export type PaymentsTableFeatures = typeof paymentsTableFeatures;

export interface PaymentsRow extends Payment {
  entityName: string;
}

const columnHelper = createColumnHelper<PaymentsTableFeatures, PaymentsRow>();

interface PaymentsColumnsActions {
  onView: (payment: Payment) => void;
  direction: PaymentDirection;
}

export function getPaymentsColumns({
  onView,
  direction,
}: PaymentsColumnsActions) {
  return columnHelper.columns([
    columnHelper.accessor("receiptNumber", {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Recibo
          <ArrowUpDown />
        </Button>
      ),
      cell: ({ getValue }) => getValue(),
    }),
    columnHelper.accessor("paymentDate", {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Fecha de pago
          <ArrowUpDown />
        </Button>
      ),
      cell: ({ getValue }) => formatDate(getValue()),
    }),
    columnHelper.accessor(
      (payment) => `${payment.entityName} ${payment.methodName}`,
      {
        id: "entity",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {direction === "INGRESO"
              ? "Método pago/Cliente"
              : "Método pago/Proveedor"}
            <ArrowUpDown />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span>{row.original.entityName || "Sin entidad asignada"}</span>
            <span className="text-xs text-muted-foreground">
              {row.original.methodName}
            </span>
          </div>
        ),
      }
    ),
    columnHelper.accessor("amount", {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Importe
          <ArrowUpDown />
        </Button>
      ),
      cell: ({ getValue }) => formatCurrency(getValue()),
    }),
    columnHelper.accessor(
      (payment) => getOptionLabel(PAYMENT_STATUSES, payment.status),
      {
        id: "status",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Estado
            <ArrowUpDown />
          </Button>
        ),
        cell: ({ row }) => <ReceiptStatusBadge status={row.original.status} />,
      }
    ),
    columnHelper.display({
      id: "actions",
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => {
        const payment = row.original;

        return (
          <TooltipProvider>
            <div className="flex items-center justify-end gap-1">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onView(payment)}
                    />
                  }
                >
                  <Eye />
                  <span className="sr-only">Ver</span>
                </TooltipTrigger>
                <TooltipContent>Ver</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        );
      },
    }),
  ]);
}
