"use client";

import { useState } from "react";
import { toast } from "sonner";

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
import { useClientes } from "@/components/clientes/clientes-provider";
import { ClientDetailModal } from "@/components/clientes/client-detail-modal";
import { ClientModal } from "@/components/clientes/client-modal";
import { ClientsDataTable } from "@/components/clientes/clients-data-table";
import type { Client } from "@/components/clientes/types";
import type { ClientFormValues } from "@/lib/schemas/client";

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Ocurrió un error inesperado. Intenta nuevamente.";
}

export default function ClientesListadoPage() {
  const { clients, addClient, updateClient, removeClient } = useClientes();
  const [modalOpen, setModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);

  function openCreate() {
    setEditingClient(null);
    setModalOpen(true);
  }

  function openEdit(client: Client) {
    setEditingClient(client);
    setModalOpen(true);
  }

  function openView(client: Client) {
    setViewingClient(client);
  }

  async function handleSave(values: ClientFormValues) {
    setIsSaving(true);

    try {
      if (editingClient) {
        await updateClient(editingClient.id, values);
        toast.success("Cliente actualizado");
      } else {
        await addClient(values);
        toast.success("Cliente registrado");
      }

      setModalOpen(false);
      setEditingClient(null);
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(client: Client) {
    try {
      await removeClient(client.id);
      toast.success("Cliente eliminado");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Registra y administra tus clientes
          </p>
        </div>
        <Button onClick={openCreate}>Registrar cliente</Button>
      </div>

      <ClientsDataTable
        clients={clients}
        onView={openView}
        onEdit={openEdit}
        onDelete={(client) => setClientToDelete(client)}
      />

      <ClientModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) {
            setEditingClient(null);
          }
        }}
        client={editingClient}
        onSave={handleSave}
        isSaving={isSaving}
      />

      <ClientDetailModal
        open={viewingClient !== null}
        onOpenChange={(open) => {
          if (!open) {
            setViewingClient(null);
          }
        }}
        client={viewingClient}
      />

      <AlertDialog
        open={clientToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setClientToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cliente</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que quieres eliminar este cliente? Esta acción no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (clientToDelete) {
                  void handleDelete(clientToDelete);
                }
                setClientToDelete(null);
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
