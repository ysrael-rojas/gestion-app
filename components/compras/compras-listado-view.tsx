"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useClientes } from "@/components/clientes/clientes-provider";
import { ListingsToolbar } from "@/components/shared/listings-toolbar";
import { PurchaseDetailModal } from "@/components/compras/purchase-detail-modal";
import { PurchaseModal } from "@/components/compras/purchase-modal";
import { PurchasesDataTable } from "@/components/compras/purchases-data-table";
import { useCompras } from "@/components/compras/compras-provider";
import type { Purchase } from "@/components/compras/types";
import type { ListadoFilters } from "@/lib/filters/listado-filters";
import type { PurchaseFormValues } from "@/lib/schemas/purchase";

interface ComprasListadoViewProps {
  filters: ListadoFilters;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "No se pudo guardar la compra. Intenta nuevamente.";
}

export function ComprasListadoView({ filters }: ComprasListadoViewProps) {
  const { clients } = useClientes();
  const { purchases, isLoading, balanceError, addPurchase, updatePurchase } = useCompras();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [viewingPurchase, setViewingPurchase] = useState<Purchase | null>(null);

  function openCreate() {
    setEditingPurchase(null);
    setModalOpen(true);
  }

  const openEdit = useCallback((purchase: Purchase) => {
    setEditingPurchase(purchase);
    setModalOpen(true);
  }, []);

  const openView = useCallback((purchase: Purchase) => {
    setViewingPurchase(purchase);
  }, []);

  async function handleSave(values: PurchaseFormValues) {
    try {
      if (editingPurchase) {
        await updatePurchase(editingPurchase.id, values);
        toast.success("Compra actualizada");
      } else {
        await addPurchase(values);
        toast.success("Compra registrada");
      }

      setModalOpen(false);
      setEditingPurchase(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Compras</h1>
        <p className="text-sm text-muted-foreground">
          Registra y administra tus compras
        </p>
      </div>

      <ListingsToolbar>
        <Button onClick={openCreate}>Registrar compra</Button>
      </ListingsToolbar>

      <PurchasesDataTable
        purchases={purchases}
        clients={clients}
        filters={filters}
        isLoading={isLoading}
        balanceError={balanceError}
        onView={openView}
        onEdit={openEdit}
      />

      <PurchaseModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) {
            setEditingPurchase(null);
          }
        }}
        purchase={editingPurchase}
        onSave={handleSave}
      />

      <PurchaseDetailModal
        open={viewingPurchase !== null}
        onOpenChange={(open) => {
          if (!open) {
            setViewingPurchase(null);
          }
        }}
        purchase={viewingPurchase}
        clients={clients}
      />
    </main>
  );
}
