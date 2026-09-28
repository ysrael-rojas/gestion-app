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
import { ArrowUpDown, Eye, Pencil, Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Client } from "@/components/clientes/types";
import type { Sale } from "@/components/ventas/types";
import {
  getOptionLabel,
  PAYMENT_TYPES,
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

const columnHelper = createColumnHelper<SalesTableFeatures, Sale>();

interface SalesColumnsActions {
  clients: Client[];
  onView: (sale: Sale) => void;
  onEdit: (sale: Sale) => void;
}

function getClientName(clients: Client[], clientId: string): string {
  return (
    clients.find((client) => client.id === clientId)?.name ??
    "Cliente no encontrado"
  );
}

export function getSalesColumns({ clients, onView, onEdit }: SalesColumnsActions) {
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
    columnHelper.accessor(
      (sale) => getOptionLabel(VOUCHER_TYPES, sale.voucherType),
      {
        id: "voucherType",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Tipo comprobante
            <ArrowUpDown />
          </Button>
        ),
        cell: ({ getValue }) => getValue(),
      }
    ),
    columnHelper.accessor("voucherNumber", {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Nro comprobante
          <ArrowUpDown />
        </Button>
      ),
      cell: ({ getValue }) => getValue(),
    }),
    columnHelper.accessor((sale) => getClientName(clients, sale.clientId), {
      id: "client",
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Cliente
          <ArrowUpDown />
        </Button>
      ),
      cell: ({ getValue }) => getValue(),
    }),
    columnHelper.accessor("total", {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Total
          <ArrowUpDown />
        </Button>
      ),
      cell: ({ getValue }) => formatCurrency(getValue()),
    }),
    columnHelper.accessor(
      (sale) => getOptionLabel(PAYMENT_TYPES, sale.paymentType),
      {
        id: "paymentType",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Tipo pago
            <ArrowUpDown />
          </Button>
        ),
        cell: ({ getValue }) => getValue(),
      }
    ),
    columnHelper.accessor(
      (sale) => getOptionLabel(SALE_STATUSES, sale.status),
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
