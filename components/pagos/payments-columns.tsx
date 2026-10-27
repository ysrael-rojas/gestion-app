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
import { ArrowUpDown, Ban, CircleDollarSign, Eye, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  Payment,
  PaymentDirection,
  PaymentListItem,
} from "@/components/pagos/types";
import { ReceiptStatusBadge } from "@/components/pagos/receipt-status-badge";
import { PAYMENT_STATUSES } from "@/lib/data/payment-options";
import { getOptionLabel } from "@/lib/data/sale-options";
import {
  ASSIGN_STATE_LABELS,
  getAssignState,
} from "@/lib/pagos/asignacion";
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

export interface PaymentsRow extends PaymentListItem {
  entityName: string;
}

const columnHelper = createColumnHelper<PaymentsTableFeatures, PaymentsRow>();

interface PaymentsColumnsActions {
  onView: (payment: Payment) => void;
  onPrint: (payment: Payment) => void;
  onAnnul: (payment: Payment) => void;
  onAssign: (payment: PaymentListItem) => void;
  direction: PaymentDirection;
}

export function getPaymentsColumns({
  onView,
  onPrint,
  onAnnul,
  onAssign,
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
      cell: ({ getValue, row }) =>
        formatCurrency(getValue(), row.original.currency),
    }),
    columnHelper.accessor("unassignedAmount", {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Saldo por asignar
          <ArrowUpDown />
        </Button>
      ),
      cell: ({ row }) => {
        const state = getAssignState(
          row.original.status,
          row.original.unassignedAmount
        );

        if (state === "ANULADO") {
          return <span className="text-sm text-muted-foreground">—</span>;
        }

        return (
          <div className="flex flex-col items-start gap-1">
            <span className="text-sm font-medium tabular-nums">
              {formatCurrency(
                row.original.unassignedAmount,
                row.original.currency
              )}
            </span>
            <Badge
              variant="outline"
              className={
                state === "POR_ASIGNAR"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:border-amber-400/40 dark:text-amber-300"
                  : "bg-muted text-muted-foreground"
              }
            >
              {ASSIGN_STATE_LABELS[state]}
            </Badge>
          </div>
        );
      },
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
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onPrint(payment)}
                    />
                  }
                >
                  <Printer />
                  <span className="sr-only">Imprimir</span>
                </TooltipTrigger>
                <TooltipContent>Imprimir</TooltipContent>
              </Tooltip>
              {getAssignState(payment.status, payment.unassignedAmount) ===
              "POR_ASIGNAR" ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onAssign(payment)}
                      />
                    }
                  >
                    <CircleDollarSign />
                    <span className="sr-only">Asignar</span>
                  </TooltipTrigger>
                  <TooltipContent>Asignar saldo</TooltipContent>
                </Tooltip>
              ) : null}
              {payment.status === "ANULADO" ? null : (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onAnnul(payment)}
                      />
                    }
                  >
                    <Ban />
                    <span className="sr-only">Anular</span>
                  </TooltipTrigger>
                  <TooltipContent>Anular</TooltipContent>
                </Tooltip>
              )}
            </div>
          </TooltipProvider>
        );
      },
    }),
  ]);
}
