"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useClientes } from "@/components/clientes/clientes-provider";
import { SaleDetailModal } from "@/components/ventas/sale-detail-modal";
import { SaleModal } from "@/components/ventas/sale-modal";
import { SalesDataTable } from "@/components/ventas/sales-data-table";
import { useVentas } from "@/components/ventas/ventas-provider";
import type { Sale } from "@/components/ventas/types";
import type { SaleFormValues } from "@/lib/schemas/sale";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "No se pudo guardar la venta. Intenta nuevamente.";
}

export default function VentasListadoPage() {
  const { clients } = useClientes();
  const { sales, isLoading, addSale, updateSale } = useVentas();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const [viewingSale, setViewingSale] = useState<Sale | null>(null);

  function openCreate() {
    setEditingSale(null);
    setModalOpen(true);
  }

  function openEdit(sale: Sale) {
    setEditingSale(sale);
    setModalOpen(true);
  }

  function openView(sale: Sale) {
    setViewingSale(sale);
  }

  async function handleSave(values: SaleFormValues) {
    try {
      if (editingSale) {
        await updateSale(editingSale.id, values);
        toast.success("Venta actualizada");
      } else {
        await addSale(values);
        toast.success("Venta registrada");
      }

      setModalOpen(false);
      setEditingSale(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ventas</h1>
          <p className="text-sm text-muted-foreground">
            Registra y administra tus ventas
          </p>
        </div>
        <Button onClick={openCreate}>Registrar venta</Button>
      </div>

      <SalesDataTable
        sales={sales}
        clients={clients}
        isLoading={isLoading}
        onView={openView}
        onEdit={openEdit}
      />

      <SaleModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) {
            setEditingSale(null);
          }
        }}
        sale={editingSale}
        onSave={handleSave}
      />

      <SaleDetailModal
        open={viewingSale !== null}
        onOpenChange={(open) => {
          if (!open) {
            setViewingSale(null);
          }
        }}
        sale={viewingSale}
        clients={clients}
      />
    </main>
  );
}
