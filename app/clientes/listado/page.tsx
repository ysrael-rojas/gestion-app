"use client";

import { useState } from "react";
import { toast } from "sonner";

import type { Client } from "@/components/clientes/types";
import type { ClientFormValues } from "@/lib/schemas/client";
import { Button } from "@/components/ui/button";

export default function ClientesListadoPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

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

      {clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay clientes registrados
        </p>
      ) : (
        <ul>
          {clients.map((client) => (
            <li key={client.id}>{client.name}</li>
          ))}
        </ul>
      )}
    </main>
  );
}
