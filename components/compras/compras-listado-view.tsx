"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { Client } from "@/components/clientes/types";
import { PaymentDrawer } from "@/components/comprobantes/payment-drawer";
import { ListingsToolbar } from "@/components/shared/listings-toolbar";
import { PurchasesDataTable } from "@/components/compras/purchases-data-table";
import { useCompras } from "@/components/compras/compras-provider";
import type { Purchase } from "@/components/compras/types";
import { listSuppliers } from "@/lib/clientes/entidades";
import type { ListadoFilters } from "@/lib/filters/listado-filters";

interface ComprasListadoViewProps {
  filters: ListadoFilters;
}

export function ComprasListadoView({ filters }: ComprasListadoViewProps) {
  const router = useRouter();
  const { purchases, isLoading, balanceError, refresh } = useCompras();
  const [suppliers, setSuppliers] = useState<Client[]>([]);
  const [paymentPurchase, setPaymentPurchase] = useState<Purchase | null>(null);

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const data = await listSuppliers();

        if (isMounted) {
          setSuppliers(data);
        }
      } catch {
        if (isMounted) {
          setSuppliers([]);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  const openEdit = useCallback(
    (purchase: Purchase) => {
      router.push(`/compras/${purchase.id}/editar`);
    },
    [router]
  );

  const openView = useCallback(
    (purchase: Purchase) => {
      router.push(`/compras/${purchase.id}`);
    },
    [router]
  );

  const openRegisterPayment = useCallback((purchase: Purchase) => {
    setPaymentPurchase(purchase);
  }, []);

  const resolveSupplierName = (supplierId: string) =>
    suppliers.find((supplier) => supplier.id === supplierId)?.name ??
    "Proveedor no encontrado";

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Compras</h1>
        <p className="text-sm text-muted-foreground">
          Registra y administra tus compras
        </p>
      </div>

      <ListingsToolbar>
        <Button onClick={() => router.push("/compras/nuevo")}>
          Registrar compra
        </Button>
      </ListingsToolbar>

      <PurchasesDataTable
        purchases={purchases}
        suppliers={suppliers}
        filters={filters}
        isLoading={isLoading}
        balanceError={balanceError}
        onView={openView}
        onEdit={openEdit}
        onRegisterPayment={openRegisterPayment}
      />

      {paymentPurchase ? (
        <PaymentDrawer
          open
          onOpenChange={(open) => {
            if (!open) {
              setPaymentPurchase(null);
            }
          }}
          direction="EGRESO"
          entityName={resolveSupplierName(paymentPurchase.supplierId)}
          voucherType={paymentPurchase.voucherType}
          voucherNumber={paymentPurchase.voucherNumber}
          issueDate={paymentPurchase.issueDate}
          condition={paymentPurchase.paymentType}
          dueDate={paymentPurchase.dueDate}
          entityId={paymentPurchase.supplierId}
          comprobanteId={paymentPurchase.id}
          total={paymentPurchase.total}
          paidAmount={paymentPurchase.paidAmount}
          balance={paymentPurchase.balance}
          onRegistered={refresh}
        />
      ) : null}
    </main>
  );
}
