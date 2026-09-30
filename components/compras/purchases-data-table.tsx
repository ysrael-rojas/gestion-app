"use client";

import { useMemo, useState } from "react";
import { useTable, type SortingState } from "@tanstack/react-table";

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
import type { Purchase } from "@/components/compras/types";
import {
  getPurchasesColumns,
  purchasesTableFeatures,
  type PurchasesRow,
} from "@/components/compras/purchases-columns";
import {
  applyListadoFilters,
  type ListadoFilters,
} from "@/lib/filters/listado-filters";

interface PurchasesDataTableProps {
  purchases: Purchase[];
  clients: Client[];
  filters: ListadoFilters;
  isLoading?: boolean;
  onView: (purchase: Purchase) => void;
  onEdit: (purchase: Purchase) => void;
}

const SKELETON_ROWS = 5;

function getSupplierName(clients: Client[], supplierId: string): string {
  return (
    clients.find((client) => client.id === supplierId)?.name ??
    "Proveedor no encontrado"
  );
}

export function PurchasesDataTable({
  purchases,
  clients,
  filters,
  isLoading = false,
  onView,
  onEdit,
}: PurchasesDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const data = useMemo<PurchasesRow[]>(() => {
    const rows = purchases.map((purchase) => ({
      ...purchase,
      supplierName: getSupplierName(clients, purchase.supplierId),
    }));

    return applyListadoFilters(rows, filters);
  }, [purchases, clients, filters]);

  const columns = useMemo(
    () => getPurchasesColumns({ onView, onEdit }),
    [onView, onEdit]
  );

  const table = useTable({
    features: purchasesTableFeatures,
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
        placeholder="Buscar compras..."
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
                  No hay compras registradas
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