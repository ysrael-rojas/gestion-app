"use client";

import { useEffect, useMemo, useState } from "react";
import { useTable, type SortingState } from "@tanstack/react-table";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
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
import type { Client } from "@/components/clientes/types";
import type { Sale } from "@/components/ventas/types";
import {
  getSalesColumns,
  salesTableFeatures,
  type SalesRow,
} from "@/components/ventas/sales-columns";
import type { BalanceLoadError } from "@/lib/comprobantes/comprobantes";
import {
  applyListadoFilters,
  type ListadoFilters,
} from "@/lib/filters/listado-filters";

interface SalesDataTableProps {
  sales: Sale[];
  clients: Client[];
  filters: ListadoFilters;
  isLoading?: boolean;
  balanceError?: BalanceLoadError | null;
  onView: (sale: Sale) => void;
  onEdit: (sale: Sale) => void;
  onRegisterPayment: (sale: Sale) => void;
}

const SKELETON_ROWS = 5;

function getClientName(clients: Client[], entityId: string): string {
  return (
    clients.find((client) => client.id === entityId)?.name ??
    "Cliente no encontrado"
  );
}

export function SalesDataTable({
  sales,
  clients,
  filters,
  isLoading = false,
  balanceError,
  onView,
  onEdit,
  onRegisterPayment,
}: SalesDataTableProps) {
  useEffect(() => {
    if (balanceError) {
      toast.error("No se pudieron cargar los saldos. Reintenta.");
    }
  }, [balanceError]);

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const data = useMemo<SalesRow[]>(() => {
    const rows = sales.map((sale) => ({
      ...sale,
      clientName: getClientName(clients, sale.entityId),
    }));

    return applyListadoFilters(rows, filters);
  }, [sales, clients, filters]);

  const columns = useMemo(
    () => getSalesColumns({ onView, onEdit, onRegisterPayment }),
    [onView, onEdit, onRegisterPayment]
  );

  const table = useTable({
    features: salesTableFeatures,
    data,
    columns,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      globalFilter,
    },
    autoResetPageIndex: true,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 10,
      },
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <Input
        placeholder="Buscar ventas..."
        value={globalFilter}
        onChange={(event) => setGlobalFilter(event.target.value)}
        className="max-w-sm"
      />

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
              Array.from({ length: SKELETON_ROWS }).map((_, rowIndex) => (
                <TableRow key={`skeleton-${rowIndex}`}>
                  {Array.from({ length: columns.length }).map(
                    (_, cellIndex) => (
                      <TableCell key={`skeleton-${rowIndex}-${cellIndex}`}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    )
                  )}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getAllCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No hay ventas registradas
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <DataTablePagination table={table} />
    </div>
  );
}
