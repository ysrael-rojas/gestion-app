"use client";

import { useMemo, useState } from "react";
import { useTable, type SortingState } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
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
import type { Client } from "@/components/clientes/types";
import { useClientes } from "@/components/clientes/clientes-provider";
import { usePagos } from "@/components/pagos/pagos-provider";
import {
  getPaymentsColumns,
  paymentsTableFeatures,
  type PaymentsRow,
} from "@/components/pagos/payments-columns";
import type { PaymentDirection } from "@/components/pagos/types";

const SKELETON_ROWS = 5;

interface ViewLabels {
  title: string;
  subtitle: string;
  search: string;
  empty: string;
}

const VIEW_LABELS: Record<PaymentDirection, ViewLabels> = {
  INGRESO: {
    title: "Ingresos",
    subtitle: "Registra y administra los cobros a clientes",
    search: "Buscar ingresos...",
    empty: "No hay ingresos registrados",
  },
  EGRESO: {
    title: "Egresos",
    subtitle: "Registra y administra los pagos a proveedores",
    search: "Buscar egresos...",
    empty: "No hay egresos registrados",
  },
};

function getEntityName(clients: Client[], entityId: string): string {
  return (
    clients.find((client) => client.id === entityId)?.name ??
    "Entidad no encontrada"
  );
}

interface PaymentsViewProps {
  direction: PaymentDirection;
}

export function PaymentsView({ direction }: PaymentsViewProps) {
  const { payments, isLoading } = usePagos();
  const { clients } = useClientes();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const labels = VIEW_LABELS[direction];

  const data = useMemo<PaymentsRow[]>(
    () =>
      payments
        .filter((payment) => payment.direction === direction)
        .map((payment) => ({
          ...payment,
          entityName: getEntityName(clients, payment.entityId),
        })),
    [payments, direction, clients]
  );

  const columns = useMemo(() => getPaymentsColumns(), []);

  const table = useTable({
    features: paymentsTableFeatures,
    data,
    columns,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      globalFilter,
    },
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: 10,
      },
    },
  });

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{labels.title}</h1>
        <p className="text-sm text-muted-foreground">{labels.subtitle}</p>
      </div>

      <div className="flex flex-col gap-4">
        <Input
          placeholder={labels.search}
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
                    {labels.empty}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </main>
  );
}
