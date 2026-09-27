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
import { ArrowUpDown, MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Client } from "@/components/clientes/types";
import { getDocumentTypeOption } from "@/lib/data/document-types";

export const clientsTableFeatures = tableFeatures({
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

export type ClientsTableFeatures = typeof clientsTableFeatures;

const columnHelper = createColumnHelper<ClientsTableFeatures, Client>();

interface ClientsColumnsActions {
  onEdit: (client: Client) => void;
  onDelete: (client: Client) => void;
}

export function getClientsColumns({ onEdit, onDelete }: ClientsColumnsActions) {
  return columnHelper.columns([
    columnHelper.accessor("name", {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Nombre
          <ArrowUpDown />
        </Button>
      ),
      cell: ({ getValue }) => getValue(),
    }),
    columnHelper.accessor(
      (client) => {
        if (client.documentType === "SIN_DOCUMENTO") {
          return "Sin documento";
        }

        const option = getDocumentTypeOption(client.documentType);
        return `${option.label}: ${client.documentNumber}`;
      },
      {
        id: "documento",
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          >
            Documento
            <ArrowUpDown />
          </Button>
        ),
        cell: ({ getValue }) => getValue(),
      }
    ),
    columnHelper.accessor("phone", {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Teléfono
          <ArrowUpDown />
        </Button>
      ),
      cell: ({ getValue }) => getValue() || "—",
    }),
    columnHelper.accessor("billingEmail", {
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Correo de facturación
          <ArrowUpDown />
        </Button>
      ),
      cell: ({ getValue }) => getValue(),
    }),
    columnHelper.display({
      id: "actions",
      header: () => <span className="sr-only">Acciones</span>,
      cell: ({ row }) => {
        const client = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon-sm" />}
            >
              <MoreHorizontal />
              <span className="sr-only">Acciones</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(client)}>
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDelete(client)}
              >
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    }),
  ]);
}
