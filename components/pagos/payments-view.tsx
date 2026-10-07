"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTable, type SortingState } from "@tanstack/react-table";
import { X } from "lucide-react";
import { toast } from "sonner";

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
import { usePagos } from "@/components/pagos/pagos-provider";
import { PaymentModal } from "@/components/pagos/payment-modal";
import { PaymentDetailModal } from "@/components/pagos/payment-detail-modal";
import { ReceiptDialog } from "@/components/pagos/receipt-dialog";
import { PaymentsListingsToolbar } from "@/components/pagos/payments-listings-toolbar";
import {
  useEntityNameResolver,
  type EntityNameResolver,
} from "@/components/pagos/use-entity-name";
import {
  getPaymentsColumns,
  paymentsTableFeatures,
  type PaymentsRow,
} from "@/components/pagos/payments-columns";
import type {
  Payment,
  PaymentDirection,
  VoucherBalance,
} from "@/components/pagos/types";
import { listOpenVouchers, listUnassignedPayments } from "@/lib/pagos/cartera";
import { isOverdue } from "@/lib/pagos/saldos";
import type { PaymentFormValues } from "@/lib/schemas/payment";
import { formatCurrency, formatDate, getTodayLocalDate } from "@/lib/utils";
import {
  applyListadoFilters,
  type ListadoFilters,
} from "@/lib/filters/listado-filters";

const SKELETON_ROWS = 5;

export type PaymentsFilter = "todas" | "pendientes" | "sin-asignar" | "vencidas";

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

const FILTER_LABELS: Record<Exclude<PaymentsFilter, "todas">, string> = {
  pendientes: "Pendientes",
  "sin-asignar": "Sin asignar",
  vencidas: "Vencidas",
};

function getFilterErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "No se pudo cargar la lista filtrada. Intenta nuevamente.";
}

interface VouchersTableProps {
  vouchers: VoucherBalance[];
  resolveName: EntityNameResolver;
  isLoading: boolean;
  emptyLabel: string;
}

function VouchersTable({
  vouchers,
  resolveName,
  isLoading,
  emptyLabel,
}: VouchersTableProps) {
  const columnsCount = 5;

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Comprobante</TableHead>
            <TableHead>Entidad</TableHead>
            <TableHead>Emisión</TableHead>
            <TableHead>Vencimiento</TableHead>
            <TableHead className="text-right">Saldo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: SKELETON_ROWS }).map((_, rowIndex) => (
              <TableRow key={`voucher-skeleton-${rowIndex}`}>
                {Array.from({ length: columnsCount }).map((_, cellIndex) => (
                  <TableCell key={`voucher-skeleton-${rowIndex}-${cellIndex}`}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : vouchers.length ? (
            vouchers.map((voucher) => (
              <TableRow key={voucher.comprobanteId}>
                <TableCell>{voucher.voucherNumber}</TableCell>
                <TableCell>
                  {resolveName(voucher.entityId)}
                </TableCell>
                <TableCell>{formatDate(voucher.issueDate)}</TableCell>
                <TableCell>
                  {voucher.effectiveDueDate
                    ? formatDate(voucher.effectiveDueDate)
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(voucher.balance)}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={columnsCount}
                className="h-24 text-center"
              >
                {emptyLabel}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

interface PaymentsViewProps {
  direction: PaymentDirection;
  filters: ListadoFilters<string>;
  initialEntityId?: string;
  initialComprobanteId?: string;
  initialFilter?: PaymentsFilter;
}

export function PaymentsView({
  direction,
  filters,
  initialEntityId,
  initialComprobanteId,
  initialFilter,
}: PaymentsViewProps) {
  const { payments, isLoading, addPayment } = usePagos();
  const resolveName = useEntityNameResolver(direction);
  const router = useRouter();
  const pathname = usePathname();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(Boolean(initialEntityId));
  const [viewingPaymentId, setViewingPaymentId] = useState<string | null>(null);
  const [printingPaymentId, setPrintingPaymentId] = useState<string | null>(null);
  const [vouchers, setVouchers] = useState<VoucherBalance[] | null>(null);
  const [unassignedIds, setUnassignedIds] = useState<Set<string> | null>(null);
  const [today] = useState(() => getTodayLocalDate());
  const filter = initialFilter ?? "todas";
  const isVoucherFilter = filter === "pendientes" || filter === "vencidas";
  const labels = VIEW_LABELS[direction];

  useEffect(() => {
    let active = true;

    if (filter === "pendientes" || filter === "vencidas") {
      listOpenVouchers(direction)
        .then((data) => {
          if (active) {
            setVouchers(data);
          }
        })
        .catch((error) => {
          if (active) {
            toast.error(getFilterErrorMessage(error));
          }
        });
    } else if (filter === "sin-asignar") {
      listUnassignedPayments(direction)
        .then((data) => {
          if (active) {
            setUnassignedIds(new Set(data.map((payment) => payment.id)));
          }
        })
        .catch((error) => {
          if (active) {
            toast.error(getFilterErrorMessage(error));
          }
        });
    }

    return () => {
      active = false;
    };
  }, [filter, direction]);

  const clearFilter = useCallback(() => {
    router.replace(pathname);
  }, [router, pathname]);

  const openView = useCallback((payment: Payment) => {
    setViewingPaymentId(payment.id);
  }, []);

  const openPrint = useCallback((paymentId: string) => {
    setViewingPaymentId(null);
    setPrintingPaymentId(paymentId);
  }, []);

  async function handleSave(values: PaymentFormValues) {
    try {
      await addPayment(values);
      toast.success("Pago registrado");
      setModalOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No se pudo registrar el pago. Intenta nuevamente."
      );
    }
  }

  const data = useMemo<PaymentsRow[]>(
    () => {
      const rows = payments
        .filter((payment) => payment.direction === direction)
        .filter((payment) =>
          filter === "sin-asignar"
            ? unassignedIds !== null && unassignedIds.has(payment.id)
            : true
        )
        .map((payment) => ({
          ...payment,
          entityName: resolveName(payment.entityId),
        }));

      return applyListadoFilters(rows, filters, { dateField: "paymentDate" });
    },
    [payments, direction, resolveName, filter, unassignedIds, filters]
  );

  const visibleVouchers = useMemo(() => {
    if (!vouchers) {
      return [];
    }

    return filter === "vencidas"
      ? vouchers.filter((voucher) =>
          isOverdue(voucher.effectiveDueDate, voucher.balance, today)
        )
      : vouchers;
  }, [vouchers, filter, today]);

  const columns = useMemo(
    () => getPaymentsColumns({ onView: openView, direction }),
    [openView, direction]
  );

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
        <PaymentsListingsToolbar>
          <Input
            placeholder={labels.search}
            value={globalFilter}
            onChange={(event) => setGlobalFilter(event.target.value)}
            className="max-w-sm"
          />
          <Button onClick={() => setModalOpen(true)}>Registrar pago</Button>
        </PaymentsListingsToolbar>

        {filter !== "todas" ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Filtro:</span>
            <span className="inline-flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-xs font-medium">
              {FILTER_LABELS[filter]}
              <button
                type="button"
                onClick={clearFilter}
                aria-label="Quitar filtro"
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </span>
          </div>
        ) : null}

        {isVoucherFilter ? (
          <VouchersTable
            vouchers={visibleVouchers}
            resolveName={resolveName}
            isLoading={vouchers === null}
            emptyLabel={
              filter === "vencidas"
                ? "No hay comprobantes vencidos"
                : "No hay comprobantes pendientes"
            }
          />
        ) : (
          <>
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
                            <TableCell
                              key={`skeleton-${rowIndex}-${cellIndex}`}
                            >
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
                        {filter === "sin-asignar"
                          ? "No hay pagos con saldo sin asignar"
                          : labels.empty}
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
          </>
        )}
      </div>

      <PaymentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        direction={direction}
        onSave={handleSave}
        initialEntityId={initialEntityId}
        initialComprobanteId={initialComprobanteId}
      />

      <PaymentDetailModal
        open={viewingPaymentId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setViewingPaymentId(null);
          }
        }}
        paymentId={viewingPaymentId}
        onPrint={openPrint}
      />

      <ReceiptDialog
        open={printingPaymentId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPrintingPaymentId(null);
          }
        }}
        paymentId={printingPaymentId}
      />
    </main>
  );
}
