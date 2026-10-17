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
import { ArrowUpDown, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Nota } from "@/components/notas/types";
import type { AdjustmentVoucherType } from "@/lib/data/nota-options";
import { getOptionLabel, VOUCHER_TYPES } from "@/lib/data/sale-options";
import { formatCurrency, formatDate } from "@/lib/utils";

export const notasTableFeatures = tableFeatures({
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

export type NotasTableFeatures = typeof notasTableFeatures;

/**
 * Fila enriquecida para la tabla: el nombre de la entidad y la etiqueta del
 * motivo se resuelven en los datos (no en el closure de la columna) para que
 * la tabla reaccione cuando clientes/proveedores cargan de forma asíncrona.
 */
export interface NotasRow extends Nota {
  entityName: string;
  motiveLabel: string | null;
}

const columnHelper = createColumnHelper<NotasTableFeatures, NotasRow>();

interface NotasColumnsActions {
  onEdit: (nota: Nota) => void;
}

export function getNotasColumns(
  voucherType: AdjustmentVoucherType,
  { onEdit }: NotasColumnsActions
) {
  const isRetencion = voucherType === "COMPROBANTE_RETENCION";

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
    ...(isRetencion
      ? []
      : [
          columnHelper.accessor(
            (nota) => (nota.voucherKind === "VENTA" ? "Emitida" : "Recibida"),
            {
              id: "origin",
              header: ({ column }) => (
                <div className="flex w-full justify-center">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      column.toggleSorting(column.getIsSorted() === "asc")
                    }
                  >
                    Origen
                    <ArrowUpDown />
                  </Button>
                </div>
              ),
              cell: ({ row }) => (
                <div className="flex justify-center">
                  <Badge
                    variant={
                      row.original.voucherKind === "VENTA"
                        ? "secondary"
                        : "outline"
                    }
                  >
                    {row.original.voucherKind === "VENTA"
                      ? "Emitida"
                      : "Recibida"}
                  </Badge>
                </div>
              ),
            }
          ),
        ]),
    columnHelper.accessor("entityName", {
      id: "entity",
      header: ({ column }) => (
        <div className="flex w-full justify-start">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Cliente / Proveedor
            <ArrowUpDown />
          </Button>
        </div>
      ),
      cell: ({ getValue }) => <div className="text-left">{getValue()}</div>,
    }),
    columnHelper.accessor(
      (nota) => {
        if (!nota.referencedNumber) {
          return "—";
        }

        return nota.referencedType
          ? `${getOptionLabel(VOUCHER_TYPES, nota.referencedType)} ${
              nota.referencedNumber
            }`
          : nota.referencedNumber;
      },
      {
        id: "referenced",
        header: () => <div className="text-center">Comp. referenciado</div>,
        cell: ({ getValue }) => (
          <div className="text-center">{getValue()}</div>
        ),
      }
    ),
    ...(isRetencion
      ? []
      : [
          columnHelper.accessor("motiveLabel", {
            id: "motive",
            header: () => <div className="text-center">Motivo</div>,
            cell: ({ getValue }) => (
              <div className="text-center">{getValue() ?? "—"}</div>
            ),
          }),
        ]),
    columnHelper.accessor("total", {
      header: ({ column }) => (
        <div className="flex w-full justify-end">
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            {isRetencion ? "Monto retenido" : "Total"}
            <ArrowUpDown />
          </Button>
        </div>
      ),
      cell: ({ getValue }) => (
        <div className="text-right">{formatCurrency(getValue())}</div>
      ),
    }),
    columnHelper.display({
      id: "actions",
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => {
        const nota = row.original;

        return (
          <TooltipProvider>
            <div className="flex items-center justify-end gap-1">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onEdit(nota)}
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
