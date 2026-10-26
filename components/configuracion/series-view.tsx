"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTable, type SortingState } from "@tanstack/react-table";

import { SerieModal } from "@/components/configuracion/serie-modal";
import {
  getSeriesColumns,
  seriesTableFeatures,
} from "@/components/configuracion/series-columns";
import { DataTablePagination } from "@/components/shared/data-table-pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useVoucherSeries } from "@/components/comprobantes/use-voucher-series";
import {
  softDeleteSeries,
  type VoucherSeries,
} from "@/lib/comprobantes/series";

const SKELETON_ROWS = 4;

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Intenta nuevamente.";
}

export function SeriesView() {
  const { series, isLoading, error, reload } = useVoucherSeries();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<VoucherSeries | null>(null);
  const [toDelete, setToDelete] = useState<VoucherSeries | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () =>
      getSeriesColumns({
        onEdit: (item) => {
          setEditing(item);
          setIsModalOpen(true);
        },
        onDelete: (item) => setToDelete(item),
      }),
    []
  );

  const table = useTable({
    features: seriesTableFeatures,
    data: series,
    columns,
    onSortingChange: setSorting,
    state: { sorting },
    autoResetPageIndex: true,
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
  });

  async function handleDelete(item: VoucherSeries) {
    try {
      await softDeleteSeries(item.id);
      toast.success("Serie eliminada");
      await reload();
    } catch (deleteError) {
      toast.error(getErrorMessage(deleteError));
    }
  }

  return (
    <Card className="bg-muted/30 ring-0">
      <CardHeader>
        <CardTitle>Series de comprobantes</CardTitle>
        <CardDescription>
          Registra las series de cada tipo de comprobante y elige cuál se
          sugiere por defecto. El correlativo avanza solo al registrar ventas.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Solo una serie por tipo puede quedar como predeterminada.
          </p>
          <Button
            onClick={() => {
              setEditing(null);
              setIsModalOpen(true);
            }}
          >
            Agregar serie
          </Button>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

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
                    No hay series registradas. Agrega la primera para que el
                    formulario de ventas sugiera la numeración.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <DataTablePagination table={table} />

        <SerieModal
          open={isModalOpen}
          onOpenChange={(open) => {
            setIsModalOpen(open);
            if (!open) {
              setEditing(null);
            }
          }}
          serie={editing}
          onSaved={reload}
        />

        <AlertDialog
          open={toDelete !== null}
          onOpenChange={(open) => {
            if (!open) {
              setToDelete(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Eliminar serie {toDelete?.code ?? ""}
              </AlertDialogTitle>
              <AlertDialogDescription>
                Dejará de sugerirse para nuevas ventas. Los comprobantes ya
                registrados no cambian.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  if (toDelete) {
                    void handleDelete(toDelete);
                  }
                  setToDelete(null);
                }}
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
