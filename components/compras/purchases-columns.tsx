"use client";

import Link from "next/link";
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
import type { Purchase } from "@/components/compras/types";
import {
  getOptionLabel,
  SALE_STATUSES,
  VOUCHER_TYPES,
} from "@/lib/data/sale-options";
import { formatCurrency, formatDate } from "@/lib/utils";

export const purchasesTableFeatures = tableFeatures({
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

export type PurchasesTableFeatures = typeof purchasesTableFeatures;

export interface PurchasesRow extends Purchase {
  supplierName: string;
}

const columnHelper = createColumnHelper<PurchasesTableFeatures, PurchasesRow>();

interface PurchasesColumnsActions {
  onView: (purchase: Purchase) => void;
  onEdit: (purchase: Purchase) => void;
}

export function getPurchasesColumns({ onView, onEdit }: PurchasesColumnsActions) {
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
      (purchase) => getOptionLabel(VOUCHER_TYPES, purchase.voucherType),
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
    columnHelper.accessor("supplierName", {
      id: "supplier",
      header: ({ column }) => (
        <div className="flex w-full justify-start">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Proveedor
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
    columnHelper.accessor((purchase) => purchase.paymentType, {
      id: "paymentType",
      header: ({ column }) => (
        <div className="flex w-full justify-center">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Condición
            <ArrowUpDown />
          </Button>
        </div>
      ),
      cell: ({ getValue }) => <div className="text-center">{getValue()}</div>,
    }),
    columnHelper.accessor((purchase) => purchase.creditDays, {
      id: "creditDays",
      header: ({ column }) => (
        <div className="flex w-full justify-center">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Días de crédito
            <ArrowUpDown />
          </Button>
        </div>
      ),
      cell: ({ getValue }) => (
        <div className="text-center">{getValue() ?? "—"}</div>
      ),
    }),
    columnHelper.accessor((purchase) => purchase.dueDate, {
      id: "dueDate",
      header: ({ column }) => (
        <div className="flex w-full justify-center">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            F. vencimiento
            <ArrowUpDown />
          </Button>
        </div>
      ),
      cell: ({ getValue }) => {
        const value = getValue();
        return (
          <div className="text-center">{value ? formatDate(value) : "—"}</div>
        );
      },
    }),
    columnHelper.accessor(
      (purchase) => getOptionLabel(SALE_STATUSES, purchase.status),
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
        const purchase = row.original;

        return (
          <TooltipProvider>
            <div className="flex items-center justify-end gap-1">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onView(purchase)}
                    />
                  }
                >
                  <Eye />
                  <span className="sr-only">Ver</span>
                </TooltipTrigger>
                <TooltipContent>Ver</TooltipContent>
              </Tooltip>
              {purchase.status === "PENDIENTE" ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        nativeButton={false}
                        render={
                          <Link
                            href={`/pagos/egresos?entityId=${purchase.supplierId}&comprobanteId=${purchase.id}`}
                          />
                        }
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
                      onClick={() => onEdit(purchase)}
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
