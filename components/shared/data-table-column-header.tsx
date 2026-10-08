"use client";

import type { Column_RowSorting, RowData, TableFeatures } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Solo necesitamos `toggleSorting` y `getIsSorted` de la columna. Esos métodos
 * no dependen de los genéricos, así que cualquier columna ordenable de TanStack
 * (`column` del `header` de `columnHelper`) es compatible con este tipo.
 */
export type SortableColumn = Pick<
  Column_RowSorting<TableFeatures, RowData>,
  "toggleSorting" | "getIsSorted"
>;

const alignClasses = {
  left: "justify-start",
  center: "justify-center",
  right: "justify-end",
} as const;

interface DataTableColumnHeaderProps {
  column: SortableColumn;
  title: string;
  align?: keyof typeof alignClasses;
  className?: string;
}

/**
 * Cabecera ordenable reutilizable para las columnas de `components/*-columns.tsx`.
 *
 * Uso:
 * header: ({ column }) => (
 *   <DataTableColumnHeader column={column} title="F. emisión" align="center" />
 * ),
 */
export function DataTableColumnHeader({
  column,
  title,
  align = "left",
  className,
}: DataTableColumnHeaderProps) {
  return (
    <div className={cn("flex w-full", alignClasses[align], className)}>
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        {title}
        <ArrowUpDown />
      </Button>
    </div>
  );
}
