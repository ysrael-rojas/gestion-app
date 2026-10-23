"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useClientes } from "@/components/clientes/clientes-provider";
import { NestedPaymentDrawers } from "@/components/comprobantes/nested-payment-drawers";
import { ListingsToolbar } from "@/components/shared/listings-toolbar";
import { SalesDataTable } from "@/components/ventas/sales-data-table";
import { useVentas } from "@/components/ventas/ventas-provider";
import type { Sale } from "@/components/ventas/types";
import type { ListadoFilters } from "@/lib/filters/listado-filters";

interface VentasListadoViewProps {
  filters: ListadoFilters;
}

export function VentasListadoView({ filters }: VentasListadoViewProps) {
  const router = useRouter();
  const { clients } = useClientes();
  const { sales, isLoading, balanceError, refresh } = useVentas();
  const [paymentSale, setPaymentSale] = useState<Sale | null>(null);

  const openEdit = useCallback(
    (sale: Sale) => {
      router.push(`/ventas/${sale.id}/editar`);
    },
    [router]
  );

  const openView = useCallback(
    (sale: Sale) => {
      router.push(`/ventas/${sale.id}`);
    },
    [router]
  );

  const openRegisterPayment = useCallback((sale: Sale) => {
    setPaymentSale(sale);
  }, []);

  const resolveClientName = (entityId: string) =>
    clients.find((client) => client.id === entityId)?.name ??
    "Cliente no encontrado";

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Ventas</h1>
        <p className="text-sm text-muted-foreground">
          Registra y administra tus ventas
        </p>
      </div>

      <ListingsToolbar>
        <Button onClick={() => router.push("/ventas/nuevo")}>
          Registrar venta
        </Button>
      </ListingsToolbar>

      <SalesDataTable
        sales={sales}
        clients={clients}
        filters={filters}
        isLoading={isLoading}
        balanceError={balanceError}
        onView={openView}
        onEdit={openEdit}
        onRegisterPayment={openRegisterPayment}
      />

      {paymentSale ? (
        <NestedPaymentDrawers
          open
          onOpenChange={(open) => {
            if (!open) {
              setPaymentSale(null);
            }
          }}
          direction="INGRESO"
          entityName={resolveClientName(paymentSale.entityId)}
          voucherType={paymentSale.voucherType}
          voucherNumber={paymentSale.voucherNumber}
          issueDate={paymentSale.issueDate}
          condition={paymentSale.paymentType}
          dueDate={paymentSale.dueDate}
          entityId={paymentSale.entityId}
          comprobanteId={paymentSale.id}
          total={paymentSale.total}
          paidAmount={paymentSale.paidAmount}
          balance={paymentSale.balance}
          onRegistered={refresh}
        />
      ) : null}
    </main>
  );
}
