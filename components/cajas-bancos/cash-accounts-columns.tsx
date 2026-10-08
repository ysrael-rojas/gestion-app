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
import { Eye, Pencil, Trash2 } from "lucide-react";

import { DataTableColumnHeader } from "@/components/shared/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { CashAccount } from "@/lib/cuentas/entidades";
import { formatCurrency } from "@/lib/utils";

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

export const cashAccountsTableFeatures = tableFeatures({
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

export type CashAccountsTableFeatures = typeof cashAccountsTableFeatures;

const columnHelper = createColumnHelper<
  CashAccountsTableFeatures,
  CashAccount
>();

interface CashAccountsColumnsActions {
  onView: (account: CashAccount) => void;
  onEdit: (account: CashAccount) => void;
  onDelete: (account: CashAccount) => void;
}

export function getCashAccountsColumns({
  onView,
  onEdit,
  onDelete,
}: CashAccountsColumnsActions) {
  return columnHelper.columns([
    columnHelper.accessor("type", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Tipo" />
      ),
      cell: ({ getValue }) => {
        const value = getValue();
        return value === "CASH_BOX" ? (
          <Badge variant="secondary">Caja</Badge>
        ) : (
          <Badge variant="default">Banco</Badge>
        );
      },
    }),
    columnHelper.accessor("name", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Nombre" />
      ),
      cell: ({ getValue }) => getValue(),
    }),
    columnHelper.accessor("bankName", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Banco" />
      ),
      cell: ({ getValue }) => getValue() ?? "—",
    }),
    columnHelper.accessor("accountNumber", {
      id: "accountNumber",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Nro de cuenta" />
      ),
      cell: ({ getValue }) => getValue() ?? "—",
    }),
    columnHelper.accessor("currency", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Moneda" />
      ),
      cell: ({ getValue }) => getValue(),
    }),
    columnHelper.accessor("openingBalance", {
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Saldo inicial"
          align="right"
        />
      ),
      cell: ({ getValue, row }) =>
        formatAmount(getValue(), row.original.currency),
    }),
    columnHelper.accessor("isActive", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Estado" />
      ),
      cell: ({ getValue }) =>
        getValue() ? (
          <Badge variant="outline">Activa</Badge>
        ) : (
          <Badge variant="destructive">Inactiva</Badge>
        ),
    }),
    columnHelper.display({
      id: "actions",
      header: () => <div className="text-right">Acciones</div>,
      cell: ({ row }) => {
        const account = row.original;
        return (
          <TooltipProvider>
            <div className="flex items-center justify-end gap-1">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onView(account)}
                      aria-label="Ver detalle"
                    />
                  }
                >
                  <Eye />
                </TooltipTrigger>
                <TooltipContent>Ver detalle</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onEdit(account)}
                      aria-label="Editar"
                    />
                  }
                >
                  <Pencil />
                </TooltipTrigger>
                <TooltipContent>Editar</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onDelete(account)}
                      aria-label="Eliminar"
                    />
                  }
                >
                  <Trash2 />
                </TooltipTrigger>
                <TooltipContent>Eliminar</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        );
      },
    }),
  ]);
}