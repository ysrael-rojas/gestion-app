"use client";

import { useMemo, useState } from "react";
import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";

import { DataTablePagination } from "@/components/shared/data-table-pagination";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ReferableComprobante } from "@/components/notas/types";
import type { AdjustmentVoucherType } from "@/lib/data/nota-options";
import { formatCurrency, formatDate } from "@/lib/utils";

const pickerTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: { includesString: filterFn_includesString },
});

/**
 * Fila enriquecida del picker: el nombre de la entidad y el tope se resuelven
 * en los datos (no en el closure de la columna) para que la tabla reaccione
 * cuando clientes/proveedores cargan de forma asíncrona.
 */
interface ReferableRow extends ReferableComprobante {
  entityName: string;
  availableTop: number;
  isSelectable: boolean;
}

const columnHelper = createColumnHelper<
  typeof pickerTableFeatures,
  ReferableRow
>();

function getReferableColumns(
  consumesCreditTop: boolean,
  onSelect: (referable: ReferableComprobante) => void
) {
  return columnHelper.columns([
    columnHelper.display({
      id: "choose",
      header: () => <span className="sr-only">Acción</span>,
      cell: ({ row }) => (
        <Button
          variant="outline"
          size="sm"
          disabled={!row.original.isSelectable}
          onClick={() => onSelect(row.original)}
        >
          Elegir
        </Button>
      ),
    }),
    columnHelper.accessor("issueDate", {
      header: () => <div className="text-left">F. emisión</div>,
      cell: ({ getValue }) => (
        <div className="text-left">{formatDate(getValue())}</div>
      ),
    }),
    columnHelper.accessor("voucherNumber", {
      header: () => <div className="text-left">Nro</div>,
      cell: ({ getValue }) => <div className="text-left">{getValue()}</div>,
    }),
    columnHelper.accessor("entityName", {
      id: "entity",
      header: () => <div className="text-left">Cliente / Proveedor</div>,
      cell: ({ getValue }) => <div className="text-left">{getValue()}</div>,
    }),
    columnHelper.accessor("total", {
      header: () => <div className="text-right">Total</div>,
      cell: ({ getValue }) => (
        <div className="text-right">{formatCurrency(getValue())}</div>
      ),
    }),
    columnHelper.accessor("availableTop", {
      header: () => <div className="text-right">Tope disponible</div>,
      cell: ({ getValue }) => (
        <div className="text-right">
          {consumesCreditTop ? formatCurrency(getValue()) : "—"}
        </div>
      ),
    }),
  ]);
}

interface ReferablePickerTableProps {
  rows: ReferableRow[];
  consumesCreditTop: boolean;
  onSelect: (referable: ReferableComprobante) => void;
}

function ReferablePickerTable({
  rows,
  consumesCreditTop,
  onSelect,
}: ReferablePickerTableProps) {
  const [globalFilter, setGlobalFilter] = useState("");

  const columns = useMemo(
    () => getReferableColumns(consumesCreditTop, onSelect),
    [consumesCreditTop, onSelect]
  );

  const table = useTable({
    features: pickerTableFeatures,
    data: rows,
    columns,
    onGlobalFilterChange: setGlobalFilter,
    state: { globalFilter },
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
        placeholder="Buscar comprobante..."
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
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={
                    row.original.isSelectable ? undefined : "opacity-50"
                  }
                >
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
                  No hay comprobantes referenciables
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

interface ReferablePickerBodyProps {
  voucherType: AdjustmentVoucherType;
  referables: ReferableComprobante[];
  resolveEntityName: (entityId: string) => string;
  onSelect: (referable: ReferableComprobante) => void;
}

function ReferablePickerBody({
  voucherType,
  referables,
  resolveEntityName,
  onSelect,
}: ReferablePickerBodyProps) {
  const isRetencion = voucherType === "COMPROBANTE_RETENCION";
  const consumesCreditTop = voucherType !== "NOTA_DEBITO";

  const rows = useMemo<ReferableRow[]>(
    () =>
      referables.map((referable) => {
        // El tope de créditos ya aplicado: lo que resta del total del comprobante.
        const availableTop = Math.max(
          0,
          referable.total - referable.creditAmount
        );

        return {
          ...referable,
          entityName: resolveEntityName(referable.entityId),
          availableTop,
          isSelectable: !consumesCreditTop || availableTop > 0,
        };
      }),
    [referables, resolveEntityName, consumesCreditTop]
  );

  const ventaRows = useMemo(
    () => rows.filter((row) => row.voucherKind === "VENTA"),
    [rows]
  );
  const compraRows = useMemo(
    () => rows.filter((row) => row.voucherKind === "COMPRA"),
    [rows]
  );

  if (isRetencion) {
    return (
      <ReferablePickerTable
        rows={compraRows}
        consumesCreditTop={consumesCreditTop}
        onSelect={onSelect}
      />
    );
  }

  return (
    <Tabs defaultValue="VENTA">
      <TabsList>
        <TabsTrigger value="VENTA">Emitidas</TabsTrigger>
        <TabsTrigger value="COMPRA">Recibidas</TabsTrigger>
      </TabsList>

      <TabsContent value="VENTA">
        <ReferablePickerTable
          rows={ventaRows}
          consumesCreditTop={consumesCreditTop}
          onSelect={onSelect}
        />
      </TabsContent>

      <TabsContent value="COMPRA">
        <ReferablePickerTable
          rows={compraRows}
          consumesCreditTop={consumesCreditTop}
          onSelect={onSelect}
        />
      </TabsContent>
    </Tabs>
  );
}

interface ReferablePickerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucherType: AdjustmentVoucherType;
  referables: ReferableComprobante[];
  resolveEntityName: (entityId: string) => string;
  onSelect: (referable: ReferableComprobante) => void;
}

export function ReferablePickerModal({
  open,
  onOpenChange,
  voucherType,
  referables,
  resolveEntityName,
  onSelect,
}: ReferablePickerModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-3xl">
        <Card className="ring-0">
          <CardHeader>
            <DialogTitle>Elegir comprobante</DialogTitle>
            <DialogDescription>
              Selecciona el comprobante que vas a referenciar
            </DialogDescription>
          </CardHeader>
          <CardContent>
            <ReferablePickerBody
              voucherType={voucherType}
              referables={referables}
              resolveEntityName={resolveEntityName}
              onSelect={onSelect}
            />
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <DialogClose render={<Button variant="outline" />}>
              Cancelar
            </DialogClose>
          </CardFooter>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
