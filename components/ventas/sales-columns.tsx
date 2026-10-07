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
import { ArrowUpDown, Eye, Pencil, Printer, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PaymentStatusBadge } from "@/components/shared/payment-status-badge";
import type { Sale } from "@/components/ventas/types";
import {
  getOptionLabel,
  SALE_STATUSES,
  VOUCHER_TYPES,
} from "@/lib/data/sale-options";
import { formatCurrency, formatDate } from "@/lib/utils";

export const salesTableFeatures = tableFeatures({
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

export type SalesTableFeatures = typeof salesTableFeatures;

/**
 * Fila enriquecida para la tabla: el nombre del cliente se resuelve en los
 * datos (no en el closure de la columna) para que la tabla reaccione cuando
 * los clientes cargan de forma asíncrona.
 */
export interface SalesRow extends Sale {
  clientName: string;
}

const columnHelper = createColumnHelper<SalesTableFeatures, SalesRow>();

interface SalesColumnsActions {
  onView: (sale: Sale) => void;
  onEdit: (sale: Sale) => void;
  onRegisterPayment: (sale: Sale) => void;
}

export function getSalesColumns({
  onView,
  onEdit,
  onRegisterPayment,
}: SalesColumnsActions) {
  return columnHelper.columns([
    columnHelper.accessor("issueDate", {
      header: ({ column }) => (
        <div className="flex w-full justify-center">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            F. emisión
            <ArrowUpDown />
          </Button>
        </div>
      ),
      cell: ({ getValue }) => (
        <div className="text-center">{formatDate(getValue())}</div>
      ),
    }),
    columnHelper.accessor(
      (sale) => getOptionLabel(VOUCHER_TYPES, sale.voucherType),
      {
        id: "voucherType",
        header: ({ column }) => (
          <div className="flex w-full justify-center">
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            >
              T. comprobante
              <ArrowUpDown />
            </Button>
          </div>
        ),
        cell: ({ getValue }) => <div className="text-center">{getValue()}</div>,
      }
    ),
    columnHelper.accessor("voucherNumber", {
      header: ({ column }) => (
        <div className="flex w-full justify-center">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Nro comprobante
            <ArrowUpDown />
          </Button>
        </div>
      ),
      cell: ({ getValue }) => <div className="text-center">{getValue()}</div>,
    }),
    columnHelper.accessor("clientName", {
      id: "client",
      header: ({ column }) => (
        <div className="flex w-full justify-start">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Cliente
            <ArrowUpDown />
          </Button>
        </div>
      ),
      cell: ({ getValue }) => <div className="text-left">{getValue()}</div>,
    }),
    columnHelper.accessor("total", {
      header: ({ column }) => (
        <div className="flex w-full justify-end">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Total
            <ArrowUpDown />
          </Button>
        </div>
      ),
      cell: ({ getValue }) => (
        <div className="text-right">{formatCurrency(getValue())}</div>
      ),
    }),
    columnHelper.accessor(
      (sale) => getOptionLabel(SALE_STATUSES, sale.status),
      {
        id: "status",
        header: ({ column }) => (
          <div className="flex w-full justify-center">
            <Button
              variant="ghost"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            >
              Estado pago
              <ArrowUpDown />
            </Button>
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex justify-center">
            <PaymentStatusBadge status={row.original.status} />
          </div>
        ),
      }
    ),
    columnHelper.display({
      id: "actions",
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => {
        const sale = row.original;

        return (
          <TooltipProvider>
            <div className="flex items-center justify-end gap-1">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onView(sale)}
                    />
                  }
                >
                  <Eye />
                  <span className="sr-only">Ver</span>
                </TooltipTrigger>
                <TooltipContent>Ver</TooltipContent>
              </Tooltip>
              {sale.status === "PENDIENTE" ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onRegisterPayment(sale)}
                      />
                    }
                  >
                    <Wallet />
                    <span className="sr-only">Registrar pago</span>
                  </TooltipTrigger>
                  <TooltipContent>Registrar pago</TooltipContent>
                </Tooltip>
              ) : null}
              <Tooltip>
                <TooltipTrigger
                  render={<Button variant="ghost" size="icon-sm" />}
                >
                  <Printer />
                  <span className="sr-only">Imprimir</span>
                </TooltipTrigger>
                <TooltipContent>Imprimir</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onEdit(sale)}
                    />
                  }
                >
                  <Pencil />
                  <span className="sr-only">Editar</span>
                </TooltipTrigger>
                <TooltipContent>Editar</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        );
      },
    }),
  ]);
}
