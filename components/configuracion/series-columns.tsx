"use client";

import {
  createColumnHelper,
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_text,
  tableFeatures,
} from "@tanstack/react-table";
import { Pencil, Trash2 } from "lucide-react";

import { DataTableColumnHeader } from "@/components/shared/data-table-column-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { VoucherSeries } from "@/lib/comprobantes/series";
import { formatSeriesCorrelative } from "@/lib/comprobantes/series";
import { getSeriesTypeLabel } from "@/lib/data/series-options";

export const seriesTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text },
});

export type SeriesTableFeatures = typeof seriesTableFeatures;

const columnHelper = createColumnHelper<SeriesTableFeatures, VoucherSeries>();

interface SeriesColumnsActions {
  onEdit: (series: VoucherSeries) => void;
  onDelete: (series: VoucherSeries) => void;
}

export function getSeriesColumns({ onEdit, onDelete }: SeriesColumnsActions) {
  return columnHelper.columns([
    columnHelper.accessor("voucherType", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Tipo" />
      ),
      cell: ({ getValue }) => getSeriesTypeLabel(getValue()),
    }),
    columnHelper.accessor("code", {
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Serie" />
      ),
      cell: ({ getValue }) => getValue(),
    }),
    columnHelper.accessor("lastNumber", {
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title="Último correlativo"
          align="center"
        />
      ),
      cell: ({ getValue }) => (
        <div className="text-center tabular-nums">
          {formatSeriesCorrelative(getValue())}
        </div>
      ),
    }),
    columnHelper.accessor("isDefault", {
      header: () => <div className="text-center">Por defecto</div>,
      cell: ({ getValue }) =>
        getValue() ? (
          <div className="text-center">
            <Badge variant="outline">Predeterminada</Badge>
          </div>
        ) : (
          <div className="text-center text-muted-foreground">—</div>
        ),
    }),
    columnHelper.display({
      id: "actions",
      header: () => <div className="text-right">Acciones</div>,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Editar serie ${row.original.code}`}
            onClick={() => onEdit(row.original)}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Eliminar serie ${row.original.code}`}
            onClick={() => onDelete(row.original)}
          >
            <Trash2 />
          </Button>
        </div>
      ),
    }),
  ]);
}
