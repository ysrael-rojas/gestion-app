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
import { ClientModal } from "@/components/clientes/client-modal";
import { ClientsDataTable } from "@/components/clientes/clients-data-table";
import type { Client } from "@/components/clientes/types";
import type { ClientFormValues } from "@/lib/schemas/client";

export default function ClientesListadoPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);

  function openCreate() {
    setEditingClient(null);
    setModalOpen(true);
  }

  function openEdit(client: Client) {
    setEditingClient(client);
    setModalOpen(true);
  }

  function handleSave(values: ClientFormValues) {
    const documentNumber =
      values.documentType === "SIN_DOCUMENTO" ? "" : values.documentNumber;

    if (editingClient) {
      setClients((prev) =>
        prev.map((client) =>
          client.id === editingClient.id
            ? { ...client, ...values, documentNumber }
            : client
        )
      );
      toast.success("Cliente actualizado");
    } else {
      setClients((prev) => [
        ...prev,
        { id: crypto.randomUUID(), ...values, documentNumber },
      ]);
      toast.success("Cliente registrado");
    }

    setModalOpen(false);
    setEditingClient(null);
  }

  function handleDelete(client: Client) {
    setClients((prev) => prev.filter((item) => item.id !== client.id));
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
                  handleDelete(clientToDelete);
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
