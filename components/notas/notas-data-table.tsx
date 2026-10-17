"use client";

import { useMemo, useState } from "react";
import { useTable, type SortingState } from "@tanstack/react-table";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { Nota } from "@/components/notas/types";
import {
  getNotasColumns,
  notasTableFeatures,
  type NotasRow,
} from "@/components/notas/notas-columns";
import {
  NOTE_MOTIVES,
  type AdjustmentVoucherType,
} from "@/lib/data/nota-options";
import { getOptionLabel } from "@/lib/data/sale-options";

interface NotasDataTableProps {
  voucherType: AdjustmentVoucherType;
  notas: Nota[];
  resolveEntityName: (entityId: string) => string;
  isLoading?: boolean;
  onEdit: (nota: Nota) => void;
}

type RelationFilter = "TODAS" | "EMITIDA" | "RECIBIDA";

const RELATION_FILTER_OPTIONS: { value: RelationFilter; label: string }[] = [
  { value: "TODAS", label: "Todas" },
  { value: "EMITIDA", label: "Emitidas" },
  { value: "RECIBIDA", label: "Recibidas" },
];

const SEARCH_PLACEHOLDERS: Record<AdjustmentVoucherType, string> = {
  NOTA_CREDITO: "Buscar notas de crédito...",
  NOTA_DEBITO: "Buscar notas de débito...",
  COMPROBANTE_RETENCION: "Buscar retenciones...",
};

const EMPTY_TEXTS: Record<AdjustmentVoucherType, string> = {
  NOTA_CREDITO: "No hay notas de crédito registradas",
  NOTA_DEBITO: "No hay notas de débito registradas",
  COMPROBANTE_RETENCION: "No hay retenciones registradas",
};

const SKELETON_ROWS = 5;

export function NotasDataTable({
  voucherType,
  notas,
  resolveEntityName,
  isLoading = false,
  onEdit,
}: NotasDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [relationFilter, setRelationFilter] =
    useState<RelationFilter>("TODAS");

  const isRetencion = voucherType === "COMPROBANTE_RETENCION";
  const motiveOptions = isRetencion ? null : NOTE_MOTIVES[voucherType];

  const columns = useMemo(
    () => getNotasColumns(voucherType, { onEdit }),
    [voucherType, onEdit]
  );

  const data = useMemo<NotasRow[]>(() => {
    return notas
      .filter((nota) => {
        if (relationFilter === "TODAS") {
          return true;
        }

        return relationFilter === "EMITIDA"
          ? nota.voucherKind === "VENTA"
          : nota.voucherKind === "COMPRA";
      })
      .map((nota) => ({
        ...nota,
        entityName: resolveEntityName(nota.entityId),
        motiveLabel:
          motiveOptions && nota.motiveCode
            ? getOptionLabel(motiveOptions, nota.motiveCode)
            : null,
      }));
  }, [notas, relationFilter, motiveOptions, resolveEntityName]);

  const table = useTable({
    features: notasTableFeatures,
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
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder={SEARCH_PLACEHOLDERS[voucherType]}
          value={globalFilter}
          onChange={(event) => setGlobalFilter(event.target.value)}
          className="max-w-sm"
        />
        {!isRetencion ? (
          <div className="flex items-center gap-2">
            <Label>Relación:</Label>
            <Select
              value={relationFilter}
              items={RELATION_FILTER_OPTIONS}
              onValueChange={(value) =>
                setRelationFilter((value ?? "TODAS") as RelationFilter)
              }
            >
              <SelectTrigger aria-label="Relación">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RELATION_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>

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
                  {EMPTY_TEXTS[voucherType]}
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
