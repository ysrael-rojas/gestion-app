"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useTable, type SortingState } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTablePagination } from "@/components/shared/data-table-pagination";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getPaymentMethodsColumns,
  paymentMethodsTableFeatures,
} from "@/components/cajas-bancos/metodos-pago-columns";
import { MetodosPagoModal } from "@/components/cajas-bancos/metodos-pago-modal";
import { listPaymentMethods, updatePaymentMethod } from "@/lib/caja/caja";
import type { PaymentMethodRef } from "@/components/pagos/types";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Intenta nuevamente.";
}

export function MetodosPagoCard() {
  const [methods, setMethods] = useState<PaymentMethodRef[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");

  const reload = useCallback(async () => {
    const data = await listPaymentMethods(false);
    setMethods(data);
  }, []);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const data = await listPaymentMethods(false);
        if (isMounted) {
          setMethods(data);
        }
      } catch (error) {
        if (isMounted) {
          toast.error(getErrorMessage(error));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggle = useCallback(async (method: PaymentMethodRef) => {
    try {
      await updatePaymentMethod(method.id, { isActive: !method.isActive });
      await reload();
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [reload]);

  const handleRename = useCallback(async (method: PaymentMethodRef) => {
    if (!editingName.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }

    try {
      await updatePaymentMethod(method.id, { name: editingName.trim() });
      await reload();
      setEditingId(null);
      setEditingName("");
      toast.success("Método actualizado");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }, [editingName, reload]);

  const filteredMethods = useMemo(
    () =>
      methods.filter((method) => {
        if (statusFilter === "active") return method.isActive;
        if (statusFilter === "inactive") return !method.isActive;
        return true;
      }),
    [methods, statusFilter]
  );

  const columns = useMemo(
    () =>
      getPaymentMethodsColumns({
        editingId,
        editingName,
        onEditingNameChange: setEditingName,
        onStartRename: (method) => {
          setEditingId(method.id);
          setEditingName(method.name);
        },
        onRename: (method) => void handleRename(method),
        onCancelRename: () => {
          setEditingId(null);
          setEditingName("");
        },
        onToggle: (method) => void handleToggle(method),
      }),
    [editingId, editingName, handleRename, handleToggle]
  );

  const table = useTable({
    features: paymentMethodsTableFeatures,
    data: filteredMethods,
    columns,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    state: { sorting, globalFilter },
    autoResetPageIndex: true,
    initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
  });

  return (
    <Card className="bg-muted/30 ring-0">
      <CardHeader>
        <CardTitle>Métodos de pago</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Select
            value={statusFilter}
            items={STATUS_FILTER_ITEMS}
            onValueChange={(value) => {
              if (value === "all" || value === "active" || value === "inactive") {
                setStatusFilter(value);
              }
            }}
          >
            <SelectTrigger aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_ITEMS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setIsModalOpen(true)}>Agregar método</Button>
        </div>

        <Input
          placeholder="Buscar por código o nombre…"
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
                    {Array.from({ length: columns.length }).map((_, cellIndex) => (
                      <TableCell key={`skeleton-${rowIndex}-${cellIndex}`}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
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
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No hay métodos registrados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <DataTablePagination table={table} />

        <MetodosPagoModal
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          onCreated={reload}
        />
      </CardContent>
    </Card>
  );
}

const STATUS_FILTER_ITEMS = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Activo" },
  { value: "inactive", label: "Inactivo" },
] as const;

const SKELETON_ROWS = 5;
