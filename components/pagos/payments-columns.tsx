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
import type { Payment } from "@/components/pagos/types";
import {
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} from "@/lib/data/payment-options";
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
}

export function getPaymentsColumns({ onView }: PaymentsColumnsActions) {
  return columnHelper.columns([
    columnHelper.accessor("issueDate", {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Fecha emisión
          <ArrowUpDown />
        </Button>
      ),
      cell: ({ getValue }) => formatDate(getValue()),
    }),
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
    columnHelper.accessor("entityName", {
      id: "entity",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Entidad
          <ArrowUpDown />
        </Button>
      ),
      cell: ({ getValue }) => getValue(),
    }),
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
      (payment) => getOptionLabel(PAYMENT_METHODS, payment.method),
      {
        id: "method",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Método
            <ArrowUpDown />
          </Button>
        ),
        cell: ({ getValue }) => getValue(),
      }
    ),
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
        cell: ({ getValue }) => getValue(),
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
